import { dbDelete, dbInsert, dbSelect, dbUpdate } from '$lib/data/db';
import type { Order, OrderItem, OrderStatus } from '$lib/types';
import { APP_TIMEZONE } from '$lib/utils';

type OrderRow = {
	id: string;
	order_number: number;
	customer_id: string | null;
	customer_phone_snapshot: string;
	address_snapshot: string;
	between_streets_snapshot: string | null;
	status: string;
	assigned_staff_id: string | null;
	assigned_staff_guest_id: string | null;
	payment_method: string;
	cash_received: number | null;
	change_due: number | null;
	notes: string | null;
	delivery_cost: number | null;
	total: number;
	created_by_user_id: string | null;
	cashier_name_snapshot: string | null;
	created_at: string;
	updated_at: string;
};

const ORDER_COLUMNS =
	'id, order_number, customer_id, customer_phone_snapshot, address_snapshot, between_streets_snapshot, status, assigned_staff_id, assigned_staff_guest_id, payment_method, cash_received, change_due, notes, delivery_cost, total, created_by_user_id, cashier_name_snapshot, created_at, updated_at';

type OrderItemRow = {
	id: string;
	order_id: string;
	product_id: string | null;
	name_snapshot: string;
	qty: number;
	unit_price: number;
	subtotal: number;
	notes: string | null;
};

function formatHour(iso: string): string {
	return new Date(iso).toLocaleTimeString('es-AR', {
		timeZone: APP_TIMEZONE,
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	});
}

function rowToOrder(row: OrderRow, items: OrderItem[]): Order {
	return {
		id: row.id,
		orderNumber: row.order_number,
		createdAt: row.created_at,
		hour: formatHour(row.created_at),
		customerId: row.customer_id ?? '',
		customerPhoneSnapshot: row.customer_phone_snapshot,
		addressSnapshot: row.address_snapshot,
		betweenStreetsSnapshot: row.between_streets_snapshot ?? undefined,
		status: row.status as OrderStatus,
		assignedStaffId: row.assigned_staff_id ?? undefined,
		assignedStaffGuestId: row.assigned_staff_guest_id ?? undefined,
		paymentMethod: row.payment_method as Order['paymentMethod'],
		cashReceived: row.cash_received ?? undefined,
		changeDue: row.change_due ?? undefined,
		notes: row.notes ?? undefined,
		deliveryCost: row.delivery_cost != null ? Number(row.delivery_cost) : undefined,
		total: Number(row.total),
		createdByUserId: row.created_by_user_id ?? undefined,
		cashierNameSnapshot: row.cashier_name_snapshot ?? undefined,
		items
	};
}

function itemRowToOrderItem(row: OrderItemRow): OrderItem {
	return {
		id: row.id,
		skuId: row.product_id ?? '',
		nameSnapshot: row.name_snapshot,
		qty: row.qty,
		unitPrice: Number(row.unit_price),
		subtotal: Number(row.subtotal),
		notes: row.notes ?? undefined
	};
}

async function fetchItemsForOrderIds(orderIds: string[]): Promise<Map<string, OrderItem[]>> {
	if (orderIds.length === 0) return new Map();
	const data = await dbSelect<OrderItemRow[]>(
		'order_items',
		({ signal, client }) =>
			client
				.from('order_items')
				.select('id, order_id, product_id, name_snapshot, qty, unit_price, subtotal, notes')
				.in('order_id', orderIds)
				.order('id', { ascending: true })
				.abortSignal(signal),
		{ source: 'ordersRepo.fetchItemsForOrderIds' }
	);
	const map = new Map<string, OrderItem[]>();
	for (const row of data ?? []) {
		const list = map.get(row.order_id) ?? [];
		list.push(itemRowToOrderItem(row));
		map.set(row.order_id, list);
	}
	return map;
}

export const ordersRepo = {
	async list(signal?: AbortSignal): Promise<Order[]> {
		const rows = await dbSelect<OrderRow[]>(
			'orders',
			({ signal: dbSignal, client }) =>
				client
					.from('orders')
					.select(ORDER_COLUMNS)
					.order('created_at', { ascending: false })
					.abortSignal(signal ?? dbSignal),
			{ signal, source: 'ordersRepo.list' }
		);
		const ids = (rows ?? []).map((r) => r.id);
		const itemsByOrder = await fetchItemsForOrderIds(ids);
		return (rows ?? []).map((r) => rowToOrder(r, itemsByOrder.get(r.id) ?? []));
	},

	async get(id: string): Promise<Order | null> {
		const row = await dbSelect<OrderRow | null>(
			'orders',
			({ signal, client }) =>
				client
					.from('orders')
					.select(ORDER_COLUMNS)
					.eq('id', id)
					.abortSignal(signal)
					.maybeSingle(),
			{ source: 'ordersRepo.get' }
		);
		if (!row) return null;
		const itemsMap = await fetchItemsForOrderIds([id]);
		return rowToOrder(row, itemsMap.get(id) ?? []);
	},

	async create(payload: Omit<Order, 'id' | 'orderNumber' | 'createdAt' | 'hour'>): Promise<Order> {
		const orderRow = await dbInsert<OrderRow>(
			'orders',
			{
				customer_id: payload.customerId || null,
				customer_phone_snapshot: payload.customerPhoneSnapshot ?? '',
				address_snapshot: payload.addressSnapshot ?? '',
				between_streets_snapshot: payload.betweenStreetsSnapshot?.trim() || null,
				status: payload.status,
				assigned_staff_id: payload.assignedStaffId || null,
				assigned_staff_guest_id: payload.assignedStaffGuestId || null,
				payment_method: payload.paymentMethod,
				cash_received: payload.cashReceived ?? null,
				change_due: payload.changeDue ?? null,
				notes: payload.notes?.trim() || null,
				delivery_cost: payload.deliveryCost ?? 0,
				total: payload.total ?? 0,
				created_by_user_id: payload.createdByUserId || null,
				cashier_name_snapshot: payload.cashierNameSnapshot?.trim() || null
			},
			({ signal, client, payload: row }) =>
				client.from('orders').insert(row).select(ORDER_COLUMNS).abortSignal(signal).single(),
			{ source: 'ordersRepo.create' }
		);

		if (payload.items?.length) {
			const itemRows = payload.items.map((item) => ({
				order_id: orderRow.id,
				product_id: item.skuId || null,
				name_snapshot: item.nameSnapshot,
				qty: item.qty,
				unit_price: item.unitPrice,
				subtotal: item.subtotal,
				notes: item.notes?.trim() || null
			}));
			await dbInsert(
				'order_items',
				itemRows,
				({ signal, client, payload }) => client.from('order_items').insert(payload).abortSignal(signal),
				{ source: 'ordersRepo.createItems' }
			);
		}

		const itemsMap = await fetchItemsForOrderIds([orderRow.id]);
		return rowToOrder(orderRow, itemsMap.get(orderRow.id) ?? []);
	},

	async update(id: string, payload: Partial<Order>): Promise<Order | null> {
		const updates: Partial<Record<keyof OrderRow, unknown>> = {};
		if (payload.customerId !== undefined) updates.customer_id = payload.customerId || null;
		if (payload.customerPhoneSnapshot !== undefined) updates.customer_phone_snapshot = payload.customerPhoneSnapshot;
		if (payload.addressSnapshot !== undefined) updates.address_snapshot = payload.addressSnapshot;
		if (payload.betweenStreetsSnapshot !== undefined) updates.between_streets_snapshot = payload.betweenStreetsSnapshot?.trim() || null;
		if (payload.status !== undefined) updates.status = payload.status;
		if (payload.assignedStaffId !== undefined) updates.assigned_staff_id = payload.assignedStaffId || null;
		if (payload.assignedStaffGuestId !== undefined) updates.assigned_staff_guest_id = payload.assignedStaffGuestId || null;
		if (payload.paymentMethod !== undefined) updates.payment_method = payload.paymentMethod;
		if (payload.cashReceived !== undefined) updates.cash_received = payload.cashReceived ?? null;
		if (payload.changeDue !== undefined) updates.change_due = payload.changeDue ?? null;
		if (payload.notes !== undefined) updates.notes = payload.notes?.trim() || null;
		if (payload.deliveryCost !== undefined) updates.delivery_cost = payload.deliveryCost ?? 0;
		if (payload.total !== undefined) updates.total = payload.total;
		if (payload.createdByUserId !== undefined) updates.created_by_user_id = payload.createdByUserId || null;
		if (payload.cashierNameSnapshot !== undefined) updates.cashier_name_snapshot = payload.cashierNameSnapshot?.trim() || null;

		if (Object.keys(updates).length > 0) {
			await dbUpdate(
				'orders',
				updates,
				{ id },
				({ signal, client, payload, match }) =>
					client.from('orders').update(payload).eq('id', match.id as string).abortSignal(signal),
				{ source: 'ordersRepo.update' }
			);
		}

		if (payload.items !== undefined) {
			await dbDelete(
				'order_items',
				{ order_id: id },
				({ signal, client, match }) =>
					client.from('order_items').delete().eq('order_id', match.order_id as string).abortSignal(signal),
				{ source: 'ordersRepo.updateDeleteItems' }
			);
			if (payload.items.length > 0) {
				const itemRows = payload.items.map((item) => ({
					order_id: id,
					product_id: item.skuId || null,
					name_snapshot: item.nameSnapshot,
					qty: item.qty,
					unit_price: item.unitPrice,
					subtotal: item.subtotal,
					notes: item.notes?.trim() || null
				}));
				await dbInsert(
					'order_items',
					itemRows,
					({ signal, client, payload }) => client.from('order_items').insert(payload).abortSignal(signal),
					{ source: 'ordersRepo.updateInsertItems' }
				);
			}
		}
		return this.get(id);
	},

	async updateStatus(id: string, status: OrderStatus): Promise<Order | null> {
		await dbUpdate(
			'orders',
			{ status },
			{ id },
			({ signal, client, payload, match }) =>
				client.from('orders').update(payload).eq('id', match.id as string).abortSignal(signal),
			{ source: 'ordersRepo.updateStatus' }
		);
		return this.get(id);
	},

	async assign(id: string, staffId: string): Promise<Order | null> {
		await dbUpdate(
			'orders',
			{ assigned_staff_id: staffId, assigned_staff_guest_id: null, status: 'ASIGNADO' },
			{ id },
			({ signal, client, payload, match }) =>
				client.from('orders').update(payload).eq('id', match.id as string).abortSignal(signal),
			{ source: 'ordersRepo.assign' }
		);
		return this.get(id);
	},

	async assignGuest(id: string, staffGuestId: string): Promise<Order | null> {
		await dbUpdate(
			'orders',
			{ assigned_staff_id: null, assigned_staff_guest_id: staffGuestId, status: 'ASIGNADO' },
			{ id },
			({ signal, client, payload, match }) =>
				client.from('orders').update(payload).eq('id', match.id as string).abortSignal(signal),
			{ source: 'ordersRepo.assignGuest' }
		);
		return this.get(id);
	},

	async unassign(id: string): Promise<Order | null> {
		await dbUpdate(
			'orders',
			{ assigned_staff_id: null, assigned_staff_guest_id: null, status: 'NO_ASIGNADO' },
			{ id },
			({ signal, client, payload, match }) =>
				client.from('orders').update(payload).eq('id', match.id as string).abortSignal(signal),
			{ source: 'ordersRepo.unassign' }
		);
		return this.get(id);
	},

	async delete(id: string): Promise<void> {
		const order = await this.get(id);
		if (!order) return;
		if (order.status !== 'BORRADOR' && order.status !== 'CANCELADO') {
			throw new Error('Solo se pueden eliminar pedidos en borrador o cancelados');
		}
		await dbDelete(
			'order_items',
			{ order_id: id },
			({ signal, client, match }) =>
				client.from('order_items').delete().eq('order_id', match.order_id as string).abortSignal(signal),
			{ source: 'ordersRepo.deleteItems' }
		);
		await dbDelete(
			'orders',
			{ id },
			({ signal, client, match }) => client.from('orders').delete().eq('id', match.id as string).abortSignal(signal),
			{ source: 'ordersRepo.delete' }
		);
	}
};

