import { api } from '$lib/api';
import type { Order, OrderStatus } from '$lib/types';
import { get, writable } from 'svelte/store';
import { posDataCache } from '$lib/pos/cache';
import { posDataLog, posDataWarn } from '$lib/pos/diagnostics';
import { timeoutForMethod } from '$lib/network/timeout-policy';
import { withTimeoutAbort } from '$lib/with-timeout-abort';

const CACHE_KEY = 'orders';
const RETRY_INTERVAL_MS = 15_000;
const LOAD_TIMEOUT_MS = timeoutForMethod('GET');

const orders = writable<Order[]>([]);
export type DataLoadStatus = 'idle' | 'loading' | 'refreshing' | 'error';
const status = writable<DataLoadStatus>('idle');
const loadError = writable<string | null>(null);
const lastLoadedAt = writable<number | null>(null);

export const ordersStatus = status;
export const ordersLoadError = loadError;
export const ordersLastLoadedAt = lastLoadedAt;

async function revalidate(): Promise<void> {
	const startStatus = get(status) === 'idle' || get(status) === 'error' ? 'refreshing' : get(status);
	status.set(startStatus);
	loadError.set(null);
	posDataLog('orders revalidate start');
	try {
		const list = await withTimeoutAbort((signal) => api.orders.list(signal), LOAD_TIMEOUT_MS, {
			method: 'GET',
			url: '/rest/v1/orders',
			source: 'ordersStore.revalidate'
		});
		orders.set(list);
		posDataCache.set(CACHE_KEY, list);
		status.set('idle');
		lastLoadedAt.set(Date.now());
		posDataLog('orders revalidate ok', { count: list.length });
	} catch (e) {
		const msg =
			e instanceof Error && e.name === 'AbortError'
				? 'La carga de pedidos superó el tiempo de espera'
				: e instanceof Error
					? e.message
					: 'Error al cargar pedidos';
		posDataWarn('orders revalidate fail', msg);
		loadError.set(msg);
		status.set('error');
		// No limpiar orders; mantener cache visible
	} finally {
		const current = get(status);
		if (current === 'loading' || current === 'refreshing') status.set('idle');
	}
}

export const ordersStore = {
	subscribe: orders.subscribe,
	status,
	loadError,
	lastLoadedAt,
	/** Carga cache primero, luego revalida en background. No limpia datos en error. */
	load: async () => {
		const cached = posDataCache.get<Order[]>(CACHE_KEY);
		if (cached?.length) {
			orders.set(cached);
			status.set('refreshing');
		} else {
			status.set('loading');
		}
		await revalidate();
	},
	revalidate: () => revalidate(),
	startRetryLoop: () => {
		const id = setInterval(() => {
			if (get(status) === 'error') void revalidate();
		}, RETRY_INTERVAL_MS);
		return () => clearInterval(id);
	},
	create: async (payload: Omit<Order, 'id' | 'orderNumber' | 'createdAt' | 'hour'>) => {
		const created = await api.orders.create(payload);
		await ordersStore.revalidate();
		return created;
	},
	assign: async (id: string, staffId: string) => {
		await api.orders.assign(id, staffId);
		await ordersStore.revalidate();
	},
	assignGuest: async (id: string, staffGuestId: string) => {
		await api.orders.assignGuest(id, staffGuestId);
		await ordersStore.revalidate();
	},
	unassign: async (id: string) => {
		await api.orders.unassign(id);
		await ordersStore.revalidate();
	},
	updateStatus: async (id: string, status: OrderStatus) => {
		await api.orders.updateStatus(id, status);
		await ordersStore.revalidate();
	},
	update: async (id: string, payload: Partial<Order>) => {
		await api.orders.update(id, payload);
		await ordersStore.revalidate();
	},
	delete: async (id: string) => {
		await api.orders.delete(id);
		await ordersStore.revalidate();
	}
};
