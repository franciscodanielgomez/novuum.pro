import type { Staff } from '$lib/types';
import { generateId } from '$lib/utils';
import { seedStaff } from './seeds';
import { readStorage, writeStorage } from './storage';

const KEY = 'staff';

const ensureSeed = () => {
	const current = readStorage<Staff[]>(KEY, []);
	if (current.length === 0) {
		writeStorage(KEY, seedStaff);
		return seedStaff;
	}
	return current;
};

export const staffRepo = {
	async list() {
		return ensureSeed();
	},
	async create(payload: Omit<Staff, 'id'>) {
		const all = ensureSeed();
		const entity: Staff = { id: generateId('stf'), ...payload };
		const next = [entity, ...all];
		writeStorage(KEY, next);
		return entity;
	},
	async update(id: string, payload: Partial<Staff>) {
		const all = ensureSeed();
		const next = all.map((s) => (s.id === id ? { ...s, ...payload } : s));
		writeStorage(KEY, next);
		return next.find((s) => s.id === id) ?? null;
	}
};
