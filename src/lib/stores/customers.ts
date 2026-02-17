import { api } from '$lib/api';
import type { Customer } from '$lib/types';
import { writable } from 'svelte/store';

const customers = writable<Customer[]>([]);

export const customersStore = {
	subscribe: customers.subscribe,
	load: async () => {
		try {
			customers.set(await api.customers.list());
		} catch {
			customers.set([]);
		}
	},
	create: async (payload: Omit<Customer, 'id' | 'createdAt'>): Promise<Customer> => {
		const created = await api.customers.create(payload);
		await customersStore.load();
		return created;
	},
	/** Crea varios clientes. Validar antes con customersBulkSchema. */
	createMany: async (payloads: Omit<Customer, 'id' | 'createdAt'>[]): Promise<Customer[]> => {
		const created: Customer[] = [];
		for (const payload of payloads) {
			const c = await api.customers.create(payload);
			created.push(c);
		}
		await customersStore.load();
		return created;
	},
	update: async (id: string, payload: Partial<Customer>) => {
		await api.customers.update(id, payload);
		await customersStore.load();
	},
	remove: async (id: string) => {
		await api.customers.remove(id);
		await customersStore.load();
	}
};
