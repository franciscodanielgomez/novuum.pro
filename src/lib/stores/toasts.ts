import { generateId } from '$lib/utils';
import { writable } from 'svelte/store';

export type Toast = {
	id: string;
	title: string;
	variant?: 'success' | 'info' | 'error';
};

const toasts = writable<Toast[]>([]);

const push = (title: string, variant: Toast['variant'] = 'info') => {
	const toast = { id: generateId('tst'), title, variant };
	toasts.update((items) => [toast, ...items].slice(0, 5));
	setTimeout(() => {
		toasts.update((items) => items.filter((i) => i.id !== toast.id));
	}, 2600);
};

export const toastsStore = {
	subscribe: toasts.subscribe,
	success: (title: string) => push(title, 'success'),
	error: (title: string) => push(title, 'error'),
	info: (title: string) => push(title, 'info'),
	remove: (id: string) => toasts.update((items) => items.filter((i) => i.id !== id))
};
