import { dev } from '$app/environment';
import { env } from '$env/dynamic/public';

const READ_TIMEOUT_MS = 30_000;
const WRITE_TIMEOUT_MS = 60_000;

function parseBool(raw: string | undefined): boolean {
	if (!raw) return false;
	const v = raw.trim().toLowerCase();
	return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export function areTimeoutsDisabled(): boolean {
	return parseBool(env.PUBLIC_DISABLE_TIMEOUTS);
}

export function timeoutForMethod(method: string): number {
	const upper = method.toUpperCase();
	const isRead = upper === 'GET' || upper === 'HEAD';
	const base = isRead ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS;
	// En desarrollo damos más margen para backend "frío".
	return dev ? base * 2 : base;
}

