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

let getSupabase: (() => {
	auth: {
		refreshSession: () => Promise<{ data: { session: unknown }; error: { message?: string } | null }>;
	};
}) | null = null;

export function setSupabaseRef(
	ref: () => {
		auth: {
			refreshSession: () => Promise<{ data: { session: unknown }; error: { message?: string } | null }>;
		};
	}
): void {
	getSupabase = ref;
}

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

export async function refreshSessionSingleFlight(): Promise<RefreshResult> {
	if (refreshPromise) return refreshPromise;
	posMetrics.incRefreshAttempts();
	refreshPromise = (async () => {
		try {
			const sb = getSupabase?.();
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
		...extra
	});
}

export function createPosFetch(): typeof fetch {
	return async function posFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
		const method = getMethod(input, init);
		const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
		const resource = sanitizeResource(url);
		const requestId = `db_${++seq}`;
		const retries = 1;
		const skip401Handling = isAuthApi(url);
		const externalSignal = init?.signal ?? null;

		let timeoutMs: number | null = null;
		let controller: AbortController | null = null;
		let timeoutId: ReturnType<typeof setTimeout> | null = null;
		if (!externalSignal) {
			timeoutMs = timeoutForMethod(method);
			controller = new AbortController();
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

		const activeSignal = externalSignal ?? controller?.signal ?? null;
		const abortHandler = () => {
			if (controller) controller.abort();
		};

		if (activeSignal?.aborted) {
			runtime.aborted = true;
			runtime.abortedBy = externalSignal ? 'external' : 'timeout-wrapper';
			debugLog('error', runtime, { error: 'Aborted before request' });
			throw new DOMException('Aborted', 'AbortError');
		}

		if (controller && timeoutMs != null) {
			timeoutId = setTimeout(() => {
				runtime.timedOut = true;
				controller?.abort();
			}, timeoutMs);
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

		debugLog('start', runtime);
		try {
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
		} catch (error) {
			const aborted = error instanceof Error && error.name === 'AbortError';
			runtime.aborted = aborted;
			if (aborted) {
				runtime.abortedBy = runtime.timedOut ? 'timeout-wrapper' : 'external';
				posMetrics.incRequestsAborted();
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

