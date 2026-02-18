import { catalogRepo } from '$lib/repo/catalogRepo';
import { customersRepo } from '$lib/repo/customersRepo';
import { ordersRepo } from '$lib/repo/ordersRepo';
import { shiftsRepo } from '$lib/repo/shiftsRepo';
import { staffRepo } from '$lib/repo/staffRepo';
import { staffGuestsRepo } from '$lib/repo/staffGuestsRepo';
import type { Order, OrderStatus, Shift } from '$lib/types';

export const api = {
	customers: customersRepo,
	staff: staffRepo,
	staffGuests: staffGuestsRepo,
	catalog: catalogRepo,
	orders: {
		list: () => ordersRepo.list(),
		get: (id: string) => ordersRepo.get(id),
		create: (payload: Omit<Order, 'id' | 'orderNumber' | 'createdAt' | 'hour'>) => ordersRepo.create(payload),
		update: (id: string, payload: Partial<Order>) => ordersRepo.update(id, payload),
		updateStatus: (id: string, status: OrderStatus) => ordersRepo.updateStatus(id, status),
		assign: (id: string, staffId: string) => ordersRepo.assign(id, staffId),
		assignGuest: (id: string, staffGuestId: string) => ordersRepo.assignGuest(id, staffGuestId),
		unassign: (id: string) => ordersRepo.unassign(id),
		delete: (id: string) => ordersRepo.delete(id)
	},
	shifts: {
		list: () => shiftsRepo.list(),
		getOpen: () => shiftsRepo.getOpen(),
		open: (
			payload: Omit<Shift, 'id' | 'openedAt' | 'status' | 'totalsByPayment' | 'total' | 'closedAt'>
		) => shiftsRepo.open(payload),
		close: (id: string, totalsByPayment: Shift['totalsByPayment'], total: number) =>
			shiftsRepo.close(id, totalsByPayment, total)
	}
};
