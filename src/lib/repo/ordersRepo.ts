import type { Order, OrderStatus } from '$lib/types';
import { generateId, isoNow, nowHour } from '$lib/utils';
import { readStorage, writeStorage } from './storage';

const KEY = 'orders';

const listSync = () => readStorage<Order[]>(KEY, []);

export const ordersRepo = {
	async list() {
		return listSync().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
	},
	async get(id: string) {
		return listSync().find((o) => o.id === id) ?? null;
	},
	async create(payload: Omit<Order, 'id' | 'createdAt' | 'hour'>) {
		const all = listSync();
		const entity: Order = {
			id: generateId('ord'),
			createdAt: isoNow(),
			hour: nowHour(),
			...payload
		};
		const next = [entity, ...all];
		writeStorage(KEY, next);
		return entity;
	},
	async update(id: string, payload: Partial<Order>) {
		const all = listSync();
		const next = all.map((order) => (order.id === id ? { ...order, ...payload } : order));
		writeStorage(KEY, next);
		return next.find((o) => o.id === id) ?? null;
	},
	async updateStatus(id: string, status: OrderStatus) {
		return this.update(id, { status });
	},
	async assign(id: string, staffId: string) {
		return this.update(id, { assignedStaffId: staffId, status: 'ASIGNADO' });
	}
};
