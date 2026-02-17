import { api } from '$lib/api';
import type { Order, OrderStatus } from '$lib/types';
import { writable } from 'svelte/store';

const orders = writable<Order[]>([]);

export const ordersStore = {
	subscribe: orders.subscribe,
	load: async () => {
		try {
			orders.set(await api.orders.list());
		} catch (e) {
			orders.set([]);
			throw e;
		}
	},
	create: async (payload: Omit<Order, 'id' | 'createdAt' | 'hour'>) => {
		const created = await api.orders.create(payload);
		await ordersStore.load();
		return created;
	},
	assign: async (id: string, staffId: string) => {
		await api.orders.assign(id, staffId);
		await ordersStore.load();
	},
	assignGuest: async (id: string, staffGuestId: string) => {
		await api.orders.assignGuest(id, staffGuestId);
		await ordersStore.load();
	},
	updateStatus: async (id: string, status: OrderStatus) => {
		await api.orders.updateStatus(id, status);
		await ordersStore.load();
	},
	update: async (id: string, payload: Partial<Order>) => {
		await api.orders.update(id, payload);
		await ordersStore.load();
	},
	delete: async (id: string) => {
		await api.orders.delete(id);
		await ordersStore.load();
	}
};
