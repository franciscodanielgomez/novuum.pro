import { api } from '$lib/api';
import type { StaffGuest } from '$lib/types';
import { writable } from 'svelte/store';

const staffGuests = writable<StaffGuest[]>([]);

export const staffGuestsStore = {
	subscribe: staffGuests.subscribe,
	load: async () => {
		try {
			staffGuests.set(await api.staffGuests.list());
		} catch {
			staffGuests.set([]);
		}
	},
	create: async (payload: Omit<StaffGuest, 'id'>) => {
		const created = await api.staffGuests.create(payload);
		await staffGuestsStore.load();
		return created;
	},
	update: async (id: string, payload: Partial<StaffGuest>) => {
		await api.staffGuests.update(id, payload);
		await staffGuestsStore.load();
	},
	remove: async (id: string) => {
		await api.staffGuests.remove(id);
		await staffGuestsStore.load();
	}
};
