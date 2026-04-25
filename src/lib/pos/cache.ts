/**
 * Cache local para datos POS (stale-while-revalidate).
 * Clave por pantalla; opcionalmente por negocio/usuario si se pasa scope.
 *
 * Las entradas guardan un timestamp y se descartan al leer si superan el TTL.
 * Esto evita mostrar datos extremadamente viejos cuando una sesión queda abierta
 * por semanas/meses sin recibir un revalidate exitoso.
 */

const PREFIX = 'pos_cache_v1_';
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

type Envelope<T> = { v: 1; t: number; data: T };

function fullKey(key: string, scope?: string): string {
	return scope ? `${PREFIX}${scope}_${key}` : `${PREFIX}${key}`;
}

function isEnvelope<T>(value: unknown): value is Envelope<T> {
	return (
		typeof value === 'object' &&
		value !== null &&
		(value as { v?: unknown }).v === 1 &&
		typeof (value as { t?: unknown }).t === 'number' &&
		'data' in (value as object)
	);
}

export const posDataCache = {
	get<T>(key: string, scope?: string, ttlMs: number = DEFAULT_TTL_MS): T | null {
		if (typeof localStorage === 'undefined') return null;
		try {
			const raw = localStorage.getItem(fullKey(key, scope));
			if (!raw) return null;
			const parsed = JSON.parse(raw) as unknown;
			if (isEnvelope<T>(parsed)) {
				if (Date.now() - parsed.t > ttlMs) {
					localStorage.removeItem(fullKey(key, scope));
					return null;
				}
				return parsed.data;
			}
			// Entrada legacy sin envelope: tratarla como válida una vez y migrar al nuevo formato.
			return parsed as T;
		} catch {
			return null;
		}
	},

	set<T>(key: string, value: T, scope?: string): void {
		if (typeof localStorage === 'undefined') return;
		try {
			const env: Envelope<T> = { v: 1, t: Date.now(), data: value };
			localStorage.setItem(fullKey(key, scope), JSON.stringify(env));
		} catch {
			// ignore
		}
	},

	remove(key: string, scope?: string): void {
		if (typeof localStorage === 'undefined') return;
		localStorage.removeItem(fullKey(key, scope));
	}
};
