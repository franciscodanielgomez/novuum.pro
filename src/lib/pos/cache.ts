/**
 * Cache local para datos POS (stale-while-revalidate).
 * Clave por pantalla; opcionalmente por negocio/usuario si se pasa scope.
 */

const PREFIX = 'pos_cache_v1_';

function fullKey(key: string, scope?: string): string {
	return scope ? `${PREFIX}${scope}_${key}` : `${PREFIX}${key}`;
}

export const posDataCache = {
	get<T>(key: string, scope?: string): T | null {
		if (typeof localStorage === 'undefined') return null;
		try {
			const raw = localStorage.getItem(fullKey(key, scope));
			if (!raw) return null;
			return JSON.parse(raw) as T;
		} catch {
			return null;
		}
	},

	set<T>(key: string, value: T, scope?: string): void {
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(fullKey(key, scope), JSON.stringify(value));
		} catch {
			// ignore
		}
	},

	remove(key: string, scope?: string): void {
		if (typeof localStorage === 'undefined') return;
		localStorage.removeItem(fullKey(key, scope));
	}
};
