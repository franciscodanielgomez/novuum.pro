/**
 * URL para que los usuarios en Web descarguen la versión Desktop.
 * En .env: VITE_DESKTOP_DOWNLOAD_URL=https://github.com/ORG/REPO/releases/latest
 */
const env = typeof import.meta !== 'undefined' ? (import.meta as { env?: Record<string, string> }).env : undefined;
export const DESKTOP_DOWNLOAD_URL =
	(env?.VITE_DESKTOP_DOWNLOAD_URL?.trim() && env.VITE_DESKTOP_DOWNLOAD_URL) ||
	'https://github.com/TU_USUARIO/TU_REPO/releases/latest';
