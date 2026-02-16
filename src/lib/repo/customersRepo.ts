import type { Customer } from '$lib/types';
import { generateId, isoNow } from '$lib/utils';
import { seedCustomers } from './seeds';
import { readStorage, writeStorage } from './storage';

const KEY = 'customers';

const ensureSeed = () => {
	const current = readStorage<Customer[]>(KEY, []);
	if (current.length === 0) {
		writeStorage(KEY, seedCustomers);
		return seedCustomers;
	}
	return current;
};

export const customersRepo = {
	async list() {
		return ensureSeed();
	},
	async create(payload: Omit<Customer, 'id' | 'createdAt'>) {
		const all = ensureSeed();
		const entity: Customer = { id: generateId('cus'), createdAt: isoNow(), ...payload };
		const next = [entity, ...all];
		writeStorage(KEY, next);
		return entity;
	},
	async update(id: string, payload: Partial<Customer>) {
		const all = ensureSeed();
		const next = all.map((c) => (c.id === id ? { ...c, ...payload } : c));
		writeStorage(KEY, next);
		return next.find((c) => c.id === id) ?? null;
	},
	async remove(id: string) {
		const all = ensureSeed();
		const next = all.filter((c) => c.id !== id);
		writeStorage(KEY, next);
	}
};
