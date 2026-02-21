import { api } from '$lib/api';
import type { Customer } from '$lib/types';
import { get, writable } from 'svelte/store';
import { posDataCache } from '$lib/pos/cache';
import { posDataLog, posDataWarn } from '$lib/pos/diagnostics';
import { timeoutForMethod } from '$lib/network/timeout-policy';
import { withTimeoutAbort } from '$lib/with-timeout-abort';

const CACHE_KEY = 'customers';
const RETRY_INTERVAL_MS = 15_000;
const LOAD_TIMEOUT_MS = timeoutForMethod('GET');

const customers = writable<Customer[]>([]);
export type DataLoadStatus = 'idle' | 'loading' | 'refreshing' | 'error';
const status = writable<DataLoadStatus>('idle');
const loadError = writable<string | null>(null);
const lastLoadedAt = writable<number | null>(null);

export const customersStatus = status;
export const customersLoadError = loadError;
export const customersLastLoadedAt = lastLoadedAt;

async function revalidate(): Promise<void> {
	const startStatus = get(status) === 'idle' || get(status) === 'error' ? 'refreshing' : get(status);
	status.set(startStatus);
	loadError.set(null);
	posDataLog('customers revalidate start');
	try {
		const list = await withTimeoutAbort((signal) => api.customers.list(signal), LOAD_TIMEOUT_MS, {
			method: 'GET',
			url: '/rest/v1/customers',
			source: 'customersStore.revalidate'
		});
		customers.set(list);
		posDataCache.set(CACHE_KEY, list);
		status.set('idle');
		lastLoadedAt.set(Date.now());
		posDataLog('customers revalidate ok', { count: list.length });
	} catch (e) {
		const msg =
			e instanceof Error && e.name === 'AbortError'
				? 'La carga de clientes superó el tiempo de espera'
				: e instanceof Error
					? e.message
					: 'Error al cargar clientes';
		posDataWarn('customers revalidate fail', msg);
		loadError.set(msg);
		status.set('error');
		// No limpiar customers; mantener cache visible
	} finally {
		// Garantiza salir de estados de carga transitoria aun ante errores no previstos.
		const current = get(status);
		if (current === 'loading' || current === 'refreshing') status.set('idle');
	}
}

export const customersStore = {
	subscribe: customers.subscribe,
	status,
	loadError,
	lastLoadedAt,
	/** Carga cache primero, luego revalida en background. No limpia datos en error. */
	load: async () => {
		const cached = posDataCache.get<Customer[]>(CACHE_KEY);
		if (cached?.length) {
			customers.set(cached);
			status.set('refreshing');
		} else {
			status.set('loading');
		}
		await revalidate();
	},
	/** Solo revalidar (usa cache actual como base). Para retry/refresh. */
	revalidate: () => revalidate(),
	/** Iniciar reintentos automáticos cada 15s cuando status es error (solo con pestaña visible). */
	startRetryLoop: () => {
		const id = setInterval(() => {
			if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
			if (get(status) === 'error') void revalidate();
		}, RETRY_INTERVAL_MS);
		return () => clearInterval(id);
	},
	create: async (payload: Omit<Customer, 'id' | 'createdAt'>): Promise<Customer> => {
		const created = await api.customers.create(payload);
		await customersStore.revalidate();
		return created;
	},
	createMany: async (payloads: Omit<Customer, 'id' | 'createdAt'>[]): Promise<Customer[]> => {
		const created: Customer[] = [];
		for (const payload of payloads) {
			const c = await api.customers.create(payload);
			created.push(c);
		}
		await customersStore.revalidate();
		return created;
	},
	update: async (id: string, payload: Partial<Customer>) => {
		await api.customers.update(id, payload);
		await customersStore.revalidate();
	},
	remove: async (id: string) => {
		await api.customers.remove(id);
		await customersStore.revalidate();
	}
};
