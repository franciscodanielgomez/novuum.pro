import { browser } from '$app/environment';
import { writable } from 'svelte/store';

export type ThemeMode = 'light' | 'dark' | 'system';

const THEME_KEY = 'grido_v0_theme';

const state = writable<ThemeMode>('system');
let currentMode: ThemeMode = 'system';
let prefersDarkListenerBound = false;
state.subscribe((mode) => {
	currentMode = mode;
});

const resolveTheme = (mode: ThemeMode): 'light' | 'dark' => {
	if (mode !== 'system') return mode;
	if (!browser) return 'light';
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const apply = (mode: ThemeMode) => {
	if (!browser) return;
	const resolved = resolveTheme(mode);
	document.documentElement.classList.toggle('dark', resolved === 'dark');
	localStorage.setItem(THEME_KEY, mode);
};

export const themeStore = {
	subscribe: state.subscribe,
	hydrate: () => {
		if (!browser) return;
		const saved = localStorage.getItem(THEME_KEY) as ThemeMode | null;
		const mode = saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
		state.set(mode);
		apply(mode);
		if (prefersDarkListenerBound) return;
		prefersDarkListenerBound = true;
		const media = window.matchMedia('(prefers-color-scheme: dark)');
		media.addEventListener('change', () => {
			if (currentMode === 'system') apply('system');
		});
	},
	set: (mode: ThemeMode) => {
		state.set(mode);
		apply(mode);
	},
	toggle: () => {
		state.update((current) => {
			const next: ThemeMode = resolveTheme(current) === 'light' ? 'dark' : 'light';
			apply(next);
			return next;
		});
	}
};
