/**
 * Diagnóstico POS: logs [pos-auth] y [pos-data] + métricas simples.
 * - refresh attempts/success/fail reason
 * - requests abortadas
 * - tiempo de load por pantalla (opcional, vía mark/measure si existe performance)
 */

const POS_DEBUG =
	typeof import.meta.env !== 'undefined' &&
	String((import.meta.env as Record<string, string>).PUBLIC_SESSION_DEBUG ?? '').toLowerCase() === 'true';

export function posAuthLog(message: string, detail?: unknown): void {
	if (!POS_DEBUG || typeof console === 'undefined') return;
	const payload = detail !== undefined ? ` ${JSON.stringify(detail)}` : '';
	console.log(`[auth] ${message}${payload}`);
}

export function posAuthWarn(message: string, detail?: unknown): void {
	if (typeof console === 'undefined') return;
	const payload = detail !== undefined ? ` ${JSON.stringify(detail)}` : '';
	console.warn(`[auth] ${message}${payload}`);
}

export function posDataLog(message: string, detail?: unknown): void {
	if (!POS_DEBUG || typeof console === 'undefined') return;
	const payload = detail !== undefined ? ` ${JSON.stringify(detail)}` : '';
	console.log(`[data] ${message}${payload}`);
}

export function posDataWarn(message: string, detail?: unknown): void {
	if (typeof console === 'undefined') return;
	const payload = detail !== undefined ? ` ${JSON.stringify(detail)}` : '';
	console.warn(`[data] ${message}${payload}`);
}

// Métricas simples (en memoria; opcional export para debugging)
const metrics = {
	refreshAttempts: 0,
	refreshSuccess: 0,
	refreshFailReason: null as string | null,
	requestsAborted: 0,
	loadStartTimes: {} as Record<string, number>
};

export const posMetrics = {
	get() {
		return { ...metrics };
	},
	incRefreshAttempts() {
		metrics.refreshAttempts++;
	},
	incRefreshSuccess() {
		metrics.refreshSuccess++;
	},
	setRefreshFailReason(reason: string) {
		metrics.refreshFailReason = reason;
	},
	incRequestsAborted() {
		metrics.requestsAborted++;
	},
	markLoadStart(screen: string) {
		metrics.loadStartTimes[screen] = Date.now();
	},
	markLoadEnd(screen: string) {
		const t0 = metrics.loadStartTimes[screen];
		if (t0) {
			posDataLog(`load ${screen}`, { durationMs: Date.now() - t0 });
			delete metrics.loadStartTimes[screen];
		}
	}
};
