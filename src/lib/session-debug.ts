/**
 * Logs para auditar sesión y carga de datos.
 * - sessionWarn: siempre en consola (401/403, reintentos, errores).
 * - sessionLog: solo si PUBLIC_SESSION_DEBUG=true (refreshToken, ensureValidSession, hydrate, onReturnToApp).
 * Buscar "[session]" en consola para filtrar.
 */
const SESSION_DEBUG =
	typeof import.meta.env !== 'undefined' &&
	String((import.meta.env as Record<string, string>).PUBLIC_SESSION_DEBUG ?? '').toLowerCase() === 'true';

export function sessionLog(message: string, detail?: unknown): void {
	if (!SESSION_DEBUG || typeof console === 'undefined') return;
	const payload = detail !== undefined ? ` ${JSON.stringify(detail)}` : '';
	console.log(`[session] ${message}${payload}`);
}

export function sessionWarn(message: string, detail?: unknown): void {
	if (typeof console === 'undefined') return;
	const payload = detail !== undefined ? ` ${JSON.stringify(detail)}` : '';
	console.warn(`[session] ${message}${payload}`);
}
