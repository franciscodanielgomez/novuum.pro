import { catalogRepo } from '$lib/repo/catalogRepo';
import { businessAddressesRepo } from '$lib/repo/businessAddressesRepo';
import { businessSettingsRepo } from '$lib/repo/businessSettingsRepo';
import { customersRepo } from '$lib/repo/customersRepo';
import { categoriesRepo } from '$lib/repo/categoriesRepo';
import { groupsRepo } from '$lib/repo/groupsRepo';
import { ordersRepo } from '$lib/repo/ordersRepo';
import { productsRepo } from '$lib/repo/productsRepo';
import { paymentMethodsRepo } from '$lib/repo/paymentMethodsRepo';
import { shiftsRepo } from '$lib/repo/shiftsRepo';
import { staffRepo } from '$lib/repo/staffRepo';
import { staffGuestsRepo } from '$lib/repo/staffGuestsRepo';
import { teamMembersRepo } from '$lib/repo/teamMembersRepo';
import { userAddressesRepo } from '$lib/repo/userAddressesRepo';
import { userProfilesRepo } from '$lib/repo/userProfilesRepo';
import type { Order, OrderStatus, Shift } from '$lib/types';

export const api = {
	customers: customersRepo,
	staff: staffRepo,
	staffGuests: staffGuestsRepo,
	catalog: catalogRepo,
	businessSettings: businessSettingsRepo,
	businessAddresses: businessAddressesRepo,
	teamMembers: teamMembersRepo,
	userProfiles: userProfilesRepo,
	userAddresses: userAddressesRepo,
	categories: categoriesRepo,
	groups: groupsRepo,
	products: productsRepo,
	paymentMethods: paymentMethodsRepo,
	orders: {
		list: (signal?: AbortSignal) => ordersRepo.list(signal),
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
