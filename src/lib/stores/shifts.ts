import { api } from '$lib/api';
import { sessionStore } from '$lib/stores/session';
import type { Shift, ShiftTurn } from '$lib/types';
import { writable } from 'svelte/store';

const current = writable<Shift | null>(null);

export const shiftsStore = {
	subscribe: current.subscribe,
	loadOpen: async () => {
		const open = await api.shifts.getOpen();
		current.set(open);
		sessionStore.setShift(open);
	},
	open: async (cashierStaffId: string, turn: ShiftTurn) => {
		const created = await api.shifts.open({ cashierStaffId, turn });
		current.set(created);
		sessionStore.setShift(created);
		return created;
	},
	close: async (id: string, totalsByPayment: Shift['totalsByPayment'], total: number) => {
		const closed = await api.shifts.close(id, totalsByPayment, total);
		current.set(null);
		sessionStore.setShift(null);
		return closed;
	}
};
