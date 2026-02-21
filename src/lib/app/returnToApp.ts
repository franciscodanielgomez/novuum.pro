/**
 * Return-to-app handshake: al volver a visible solo se verifica/refresca la sesión.
 * NO se revalida ninguna store (orders, customers, products, etc.); cada página carga sus datos al montar.
 */

import { supabase } from '$lib/supabase/client';
import { refreshSessionSingleFlight } from '$lib/network/supabaseFetch';
import { uiStore } from '$lib/stores/uiStore';

const SESSION_TIMEOUT_MS = 20_000;
const DEBOUNCE_MS = 1500;
const EXPIRES_IN_THRESHOLD_SEC = 60;
const HANDSHAKE_COOLDOWN_MS = 30_000;

let handshakeLock = false;
let lastHandshakeAt = 0;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function isTransientFailure(e: unknown): boolean {
	if (e instanceof Error && e.name === 'AbortError') return true;
	if (e instanceof Error && e.message === 'timeout') return true;
	return false;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	return new Promise((resolve, reject) => {
		const t = setTimeout(() => reject(new Error('timeout')), ms);
		promise.then(
			(v) => {
				clearTimeout(t);
				resolve(v);
			},
			(e) => {
				clearTimeout(t);
				reject(e);
			}
		);
	});
}

export type EnsureSessionResult =
	| { ok: true }
	| { ok: false; transient: boolean };

/**
 * Ensures we have a valid session: getSession(); if no session, return (no logout).
 * If expiresIn < 60s, refresh (singleflight). Timeout 20s without aborting Supabase requests.
 * Returns { ok, transient } so caller can avoid showing reconnectFailed for timeouts/AbortError.
 */
export async function ensureSessionHealthy(): Promise<EnsureSessionResult> {
	try {
		const sessionPromise = (async () => {
			const { data } = await supabase.auth.getSession();
			if (!data?.session) return false;
			const expiresAt = data.session.expires_at;
			if (typeof expiresAt !== 'number') return true;
			const expiresInSec = expiresAt - Date.now() / 1000;
			if (expiresInSec < EXPIRES_IN_THRESHOLD_SEC) {
				const result = await refreshSessionSingleFlight();
				if (!result.ok) return false;
			}
			return true;
		})();
		const ok = await withTimeout(sessionPromise, SESSION_TIMEOUT_MS);
		return ok ? { ok: true } : { ok: false, transient: false };
	} catch (e) {
		// Timeout or AbortError: do not logout or redirect; do not show banner as hard failure
		return { ok: false, transient: isTransientFailure(e) };
	}
}

/**
 * Handshake: solo verificar/refrescar sesión. No toca refreshTrigger ni orders/customers/products.
 * Cada página carga sus datos al montar.
 */
export async function runReturnToAppHandshake(reason?: string): Promise<void> {
	if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
		console.debug('[returnToApp] handshake attempt', { reason, skippedBecause: 'hidden' });
		return;
	}
	const now = Date.now();
	if (now - lastHandshakeAt < HANDSHAKE_COOLDOWN_MS) {
		console.debug('[returnToApp] handshake attempt', {
			reason,
			skippedBecause: 'cooldown',
			elapsedMs: now - lastHandshakeAt,
			requiredMs: HANDSHAKE_COOLDOWN_MS
		});
		return;
	}
	const ui = uiStore.getState();
	if (ui.modalOpen || ui.formDirty) {
		uiStore._update({ pendingReturnHandshake: true });
		console.debug('[returnToApp] handshake attempt', {
			reason,
			skippedBecause: ui.modalOpen ? 'modalOpen' : 'formDirty'
		});
		return;
	}
	if (handshakeLock) {
		console.debug('[returnToApp] handshake attempt', { reason, skippedBecause: 'lock' });
		return;
	}
	lastHandshakeAt = now;
	console.debug('[returnToApp] handshake running', { reason });
	handshakeLock = true;
	try {
		const result = await ensureSessionHealthy();
		if (!result.ok) {
			if (!result.transient) {
				uiStore._update({ reconnectFailed: true });
			}
			return;
		}
		uiStore._update({ reconnectFailed: false, pendingReturnHandshake: false });
	} catch (e) {
		if (!isTransientFailure(e)) {
			uiStore._update({ reconnectFailed: true });
		}
	} finally {
		handshakeLock = false;
	}
}

function scheduleCallback(cb: () => void | Promise<void>): void {
	if (debounceTimer) clearTimeout(debounceTimer);
	debounceTimer = setTimeout(() => {
		debounceTimer = null;
		void (async () => {
			if (handshakeLock) return;
			await cb();
		})();
	}, DEBOUNCE_MS);
}

/**
 * Pre-check antes de programar handshake: cooldown 30s, onLine, sin modal/formDirty.
 * Si no pasa: log DEV y/o set pendingReturnHandshake; no actualiza lastHandshakeAt.
 */
function shouldScheduleHandshake(): { ok: true } | { ok: false; reason: string } {
	if (typeof document === 'undefined' || document.visibilityState !== 'visible') {
		return { ok: false, reason: 'hidden' };
	}
	if (typeof navigator !== 'undefined' && navigator.onLine === false) {
		console.debug('[returnToApp] schedule skipped', { reason: 'offline' });
		return { ok: false, reason: 'offline' };
	}
	const now = Date.now();
	if (now - lastHandshakeAt < HANDSHAKE_COOLDOWN_MS && lastHandshakeAt > 0) {
		console.debug('[returnToApp] schedule skipped', {
			reason: 'cooldown',
			elapsedMs: now - lastHandshakeAt,
			requiredMs: HANDSHAKE_COOLDOWN_MS
		});
		return { ok: false, reason: 'cooldown' };
	}
	const ui = uiStore.getState();
	if (ui.modalOpen || ui.formDirty) {
		uiStore._update({ pendingReturnHandshake: true });
		console.debug('[returnToApp] schedule skipped', {
			reason: ui.modalOpen ? 'modalOpen' : 'formDirty'
		});
		return { ok: false, reason: ui.modalOpen ? 'modalOpen' : 'formDirty' };
	}
	return { ok: true };
}

/**
 * Subscribe to return-to-app: solo visibilitychange + pageshow (sin focus para evitar doble ejecución).
 * Cooldown 30s, onLine y modal/formDirty se comprueban antes de programar; debounce 1500ms.
 */
export function subscribeReturnToApp(callback: () => void | Promise<void>): () => void {
	const cb = callback;

	const maybeSchedule = () => {
		const check = shouldScheduleHandshake();
		if (!check.ok) return;
		scheduleCallback(cb);
	};

	const onVisibilityChange = () => {
		if (typeof document !== 'undefined' && document.visibilityState === 'visible') maybeSchedule();
	};

	const onPageShow = () => {
		if (typeof document !== 'undefined' && document.visibilityState === 'visible') maybeSchedule();
	};

	document.addEventListener('visibilitychange', onVisibilityChange);
	window.addEventListener('pageshow', onPageShow);

	return () => {
		if (debounceTimer) {
			clearTimeout(debounceTimer);
			debounceTimer = null;
		}
		document.removeEventListener('visibilitychange', onVisibilityChange);
		window.removeEventListener('pageshow', onPageShow);
	};
}
