import { isBrowser } from '$lib/utils';

const VERSION = 'grido_v0';

export const storageKey = (name: string) => `${VERSION}_${name}`;

export const readStorage = <T>(name: string, fallback: T): T => {
	if (!isBrowser()) return fallback;
	const raw = localStorage.getItem(storageKey(name));
	if (!raw) return fallback;
	try {
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
};

export const writeStorage = <T>(name: string, value: T) => {
	if (!isBrowser()) return;
	localStorage.setItem(storageKey(name), JSON.stringify(value));
};
