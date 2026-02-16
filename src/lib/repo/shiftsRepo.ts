import type { Shift } from '$lib/types';
import { generateId, isoNow } from '$lib/utils';
import { readStorage, writeStorage } from './storage';

const KEY = 'shifts';

const listSync = () => readStorage<Shift[]>(KEY, []);

export const shiftsRepo = {
	async list() {
		return listSync().sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1));
	},
	async getOpen() {
		return listSync().find((s) => s.status === 'OPEN') ?? null;
	},
	async open(payload: Omit<Shift, 'id' | 'openedAt' | 'status' | 'totalsByPayment' | 'total'>) {
		const all = listSync();
		const entity: Shift = {
			id: generateId('shf'),
			openedAt: isoNow(),
			status: 'OPEN',
			totalsByPayment: { CASH: 0, MP: 0, TRANSFER: 0 },
			total: 0,
			...payload
		};
		const next = [entity, ...all];
		writeStorage(KEY, next);
		return entity;
	},
	async close(id: string, totalsByPayment: Shift['totalsByPayment'], total: number) {
		const all = listSync();
		const next = all.map((shift) =>
			shift.id === id
				? { ...shift, status: 'CLOSED' as const, closedAt: isoNow(), totalsByPayment, total }
				: shift
		);
		writeStorage(KEY, next);
		return next.find((s) => s.id === id) ?? null;
	}
};
