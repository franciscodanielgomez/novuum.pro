import { dev } from '$app/environment';
import { timeoutForMethod } from '$lib/network/timeout-policy';
import { posAuthLog, posAuthWarn, posMetrics } from '$lib/pos/diagnostics';

const REST_V1 = '/rest/v1/';
const AUTH_V1 = '/auth/v1/';
const nativeFetch: typeof fetch = globalThis.fetch.bind(globalThis);

function isRestApi(url: string): boolean {
	return url.includes(REST_V1);
}

function isAuthApi(url: string): boolean {
	return url.includes(AUTH_V1);
}

function getMethod(input: RequestInfo | URL, init?: RequestInit): string {
	if (input instanceof Request) return input.method.toUpperCase();
	return (init?.method ?? 'GET').toUpperCase();
}

function sanitizeResource(url: string): string {
	try {
		const u = new URL(url, 'http://localhost');
		return `${u.pathname}${u.search}`;
	} catch {
		return url.slice(0, 200);
	}
}

function isVisible(): boolean {
	return typeof document !== 'undefined' && document.visibilityState === 'visible';
}

/** Mínimo necesario para refresh en 401; se resuelve lazy para evitar circular con client.ts */
type GetSupabaseClient = () => {
	auth: {
		refreshSession: () => Promise<{ data: { session: unknown }; error: { message?: string } | null }>;
	};
};

let getSupabaseRef: GetSupabaseClient | null = null;

type AuthHandlers = {
	onHardExpired: () => void;
	onOffline: () => void;
};
let authHandlers: AuthHandlers | null = null;
export function setPosFetchAuthHandlers(handlers: AuthHandlers): void {
	authHandlers = handlers;
}

type RefreshResult = { ok: boolean; invalidGrant: boolean };

let refreshPromise: Promise<RefreshResult> | null = null;
let seq = 0;

/** Único singleflight global para refresh. Usado en 401-retry y en return-to-app (solo si expiresIn < 60s). */
export async function refreshSessionSingleFlight(): Promise<RefreshResult> {
	if (refreshPromise) return refreshPromise;
	posMetrics.incRefreshAttempts();
	refreshPromise = (async () => {
		try {
			const sb = getSupabaseRef?.();
			if (!sb) return { ok: false, invalidGrant: false };
			const { data, error } = await sb.auth.refreshSession();
			if (error) {
				const msg = error.message ?? '';
				const invalidGrant = /invalid_grant|refresh_token.*revoked|refresh token.*(invalid|not found|expired)/i.test(msg);
				posAuthWarn('[db-fetch] refresh failed', { invalidGrant, msg });
				posMetrics.setRefreshFailReason(msg);
				return { ok: false, invalidGrant };
			}
			if (data?.session == null) return { ok: false, invalidGrant: false };
			posAuthLog('[db-fetch] refresh ok');
			posMetrics.incRefreshSuccess();
			return { ok: true, invalidGrant: false };
		} catch (e) {
			posAuthWarn('[db-fetch] refresh error', e instanceof Error ? e.message : String(e));
			return { ok: false, invalidGrant: false };
		} finally {
			refreshPromise = null;
		}
	})();
	return refreshPromise;
}

type RequestRuntime = {
	requestId: string;
	method: string;
	resource: string;
	startedAt: number;
	timeoutMs: number | null;
	timedOut: boolean;
	status: number | null;
	aborted: boolean;
	abortedBy: 'timeout-wrapper' | 'external' | null;
};

function debugLog(stage: 'start' | 'end' | 'error', runtime: RequestRuntime, extra?: Record<string, unknown>) {
	if (!dev) return;
	const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
	const elapsed = Math.round(now - runtime.startedAt);
	console.debug(`[db] ${stage}`, {
		requestId: runtime.requestId,
		method: runtime.method,
		resource: runtime.resource,
		timeoutMs: runtime.timeoutMs,
		ms: elapsed,
		status: runtime.status,
		aborted: runtime.aborted,
		abortedBy: runtime.abortedBy,
		visibilityState: typeof document !== 'undefined' ? document.visibilityState : undefined,
		onLine: typeof navigator !== 'undefined' ? navigator.onLine : undefined,
		...extra
	});
}

/**
 * Crea el fetch que envuelve todas las peticiones de Supabase.
 * getSupabase se invoca solo al ejecutar requests (p. ej. en 401 para refresh), no al construir,
 * así se evita dependencia circular con client.ts (supabase se asigna después de createClient).
 */
export function createPosFetch(getSupabase: GetSupabaseClient): typeof fetch {
	getSupabaseRef = getSupabase;
	return async function posFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
		const method = getMethod(input, init);
		const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
		const resource = sanitizeResource(url);
		const requestId = `db_${++seq}`;
		const retries = 1;
		const skip401Handling = isAuthApi(url);
		const externalSignal = init?.signal ?? null;

		// Auth: sin timeout aquí. Resto: timeout "soft" solo cuando la pestaña es visible (background-safe).
		// En background no iniciamos timeout para evitar que timers throttled aborten al volver.
		let timeoutMs: number | null = null;
		let timeoutId: ReturnType<typeof setTimeout> | null = null;
		if (!externalSignal && !isAuthApi(url)) {
			const baseMs = timeoutForMethod(method);
			if (isVisible()) {
				timeoutMs = baseMs;
			}
			// Si !isVisible() dejamos timeoutMs = null: no timeout en background, no abort.
		}

		const runtime: RequestRuntime = {
			requestId,
			method,
			resource,
			startedAt: typeof performance !== 'undefined' ? performance.now() : Date.now(),
			timeoutMs,
			timedOut: false,
			status: null,
			aborted: false,
			abortedBy: null
		};

		// Solo señal externa; no usamos AbortController para timeout (soft timeout: rechazar sin abortar el fetch).
		const activeSignal = externalSignal ?? null;
		const abortHandler = () => {
			// Solo relevante si hay externalSignal
		};

		if (activeSignal?.aborted) {
			runtime.aborted = true;
			runtime.abortedBy = 'external';
			debugLog('error', runtime, { error: 'Aborted before request' });
			throw new DOMException('Aborted', 'AbortError');
		}
		if (externalSignal) externalSignal.addEventListener('abort', abortHandler, { once: true });

		const doRequest = async (reqInput: RequestInfo | URL, reqInit?: RequestInit): Promise<Response> => {
			const { signal: _ignore, ...rest } = reqInit ?? {};
			return nativeFetch(reqInput, { ...rest, signal: activeSignal ?? undefined });
		};

		let firstInput: RequestInfo | URL = input;
		let canRetry = retries > 0;
		if (input instanceof Request) {
			try {
				firstInput = input.clone();
			} catch {
				canRetry = false;
			}
		}

		const run = async (): Promise<Response> => {
			if (skip401Handling) {
				const res = await doRequest(input, init);
				runtime.status = res.status;
				debugLog('end', runtime);
				return res;
			}

			let res = await doRequest(firstInput, init);
			runtime.status = res.status;

			if (res.status === 403) {
				debugLog('end', runtime, { forbidden: true });
				return res;
			}

			// 401: un solo reintento tras refresh (SDK ya tiene autoRefreshToken; este path es por si el token venció en vuelo).
			if (res.status === 401 && isRestApi(url) && canRetry) {
				const refreshResult = await refreshSessionSingleFlight();
				if (refreshResult.invalidGrant) authHandlers?.onHardExpired();
				if (!refreshResult.ok) {
					authHandlers?.onOffline();
					debugLog('end', runtime, { retried: false, reason: 'refresh_failed' });
					return res;
				}
				const retryInput = input instanceof Request ? input : firstInput;
				res = await doRequest(retryInput, init);
				runtime.status = res.status;
				if (res.status === 401) authHandlers?.onOffline();
				debugLog('end', runtime, { retried: true });
				return res;
			}

			debugLog('end', runtime);
			return res;
		};

		// Timeout "soft": rechazar tras timeoutMs sin abortar el fetch (evita que el SDK quede roto al volver).
		const runWithOptionalSoftTimeout = (): Promise<Response> => {
			if (timeoutMs == null) return run();
			return new Promise((resolve, reject) => {
				timeoutId = setTimeout(() => {
					runtime.timedOut = true;
					posMetrics.incRequestsAborted();
					reject(new DOMException('Request timed out', 'AbortError'));
				}, timeoutMs);
				run()
					.then((r) => {
						if (timeoutId) clearTimeout(timeoutId);
						timeoutId = null;
						resolve(r);
					})
					.catch((e) => {
						if (timeoutId) clearTimeout(timeoutId);
						timeoutId = null;
						reject(e);
					});
			});
		};

		debugLog('start', runtime);
		try {
			return await runWithOptionalSoftTimeout();
		} catch (error) {
			const aborted = error instanceof Error && error.name === 'AbortError';
			runtime.aborted = aborted;
			if (aborted) {
				runtime.abortedBy = runtime.timedOut ? 'timeout-wrapper' : 'external';
				// Nunca logout por AbortError/timeout
			} else {
				authHandlers?.onOffline();
			}
			debugLog('error', runtime, {
				error: error instanceof Error ? error.message : String(error)
			});
			if (runtime.timedOut) {
				throw new DOMException('Request timed out', 'AbortError');
			}
			throw error;
		} finally {
			if (timeoutId) clearTimeout(timeoutId);
			if (externalSignal) externalSignal.removeEventListener('abort', abortHandler);
		}
	};
}

