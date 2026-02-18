import type { Order, OrderItem, OrderStatus } from '$lib/types';
import { APP_TIMEZONE } from '$lib/utils';
import { supabase } from '$lib/supabase/client';

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
	total: number;
	created_by_user_id: string | null;
	cashier_name_snapshot: string | null;
	created_at: string;
	updated_at: string;
};

const ORDER_COLUMNS =
	'id, order_number, customer_id, customer_phone_snapshot, address_snapshot, between_streets_snapshot, status, assigned_staff_id, assigned_staff_guest_id, payment_method, cash_received, change_due, notes, total, created_by_user_id, cashier_name_snapshot, created_at, updated_at';

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
	const { data, error } = await supabase
		.from('order_items')
		.select('id, order_id, product_id, name_snapshot, qty, unit_price, subtotal, notes')
		.in('order_id', orderIds)
		.order('id', { ascending: true });
	if (error) throw error;
	const map = new Map<string, OrderItem[]>();
	for (const row of data ?? []) {
		const r = row as OrderItemRow;
		const list = map.get(r.order_id) ?? [];
		list.push(itemRowToOrderItem(r));
		map.set(r.order_id, list);
	}
	return map;
}

export const ordersRepo = {
	async list(): Promise<Order[]> {
		const { data, error } = await supabase
			.from('orders')
			.select(ORDER_COLUMNS)
			.order('created_at', { ascending: false });
		if (error) throw error;
		const rows = (data ?? []) as OrderRow[];
		const ids = rows.map((r) => r.id);
		const itemsByOrder = await fetchItemsForOrderIds(ids);
		return rows.map((r) => rowToOrder(r, itemsByOrder.get(r.id) ?? []));
	},

	async get(id: string): Promise<Order | null> {
		const { data, error } = await supabase
			.from('orders')
			.select(ORDER_COLUMNS)
			.eq('id', id)
			.single();
		if (error) {
			if (error.code === 'PGRST116') return null;
			throw error;
		}
		const itemsMap = await fetchItemsForOrderIds([id]);
		return rowToOrder(data as OrderRow, itemsMap.get(id) ?? []);
	},

	async create(payload: Omit<Order, 'id' | 'orderNumber' | 'createdAt' | 'hour'>): Promise<Order> {
		const { data: orderData, error: orderError } = await supabase
			.from('orders')
			.insert({
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
				total: payload.total ?? 0,
				created_by_user_id: payload.createdByUserId || null,
				cashier_name_snapshot: payload.cashierNameSnapshot?.trim() || null
			})
			.select(ORDER_COLUMNS)
			.single();
		if (orderError) throw orderError;
		const orderRow = orderData as OrderRow;
		const orderId = orderRow.id;

		if (payload.items?.length) {
			const itemRows = payload.items.map((item) => ({
				order_id: orderId,
				product_id: item.skuId || null,
				name_snapshot: item.nameSnapshot,
				qty: item.qty,
				unit_price: item.unitPrice,
				subtotal: item.subtotal,
				notes: item.notes?.trim() || null
			}));
			const { error: itemsError } = await supabase.from('order_items').insert(itemRows);
			if (itemsError) throw itemsError;
		}

		const itemsMap = await fetchItemsForOrderIds([orderId]);
		return rowToOrder(orderRow, itemsMap.get(orderId) ?? []);
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
		if (payload.total !== undefined) updates.total = payload.total;
		if (payload.createdByUserId !== undefined) updates.created_by_user_id = payload.createdByUserId || null;
		if (payload.cashierNameSnapshot !== undefined) updates.cashier_name_snapshot = payload.cashierNameSnapshot?.trim() || null;

		if (Object.keys(updates).length > 0) {
			const { error } = await supabase.from('orders').update(updates).eq('id', id);
			if (error) throw error;
		}

		if (payload.items !== undefined) {
			const { error: delError } = await supabase.from('order_items').delete().eq('order_id', id);
			if (delError) throw delError;
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
				const { error: insError } = await supabase.from('order_items').insert(itemRows);
				if (insError) throw insError;
			}
		}

		return this.get(id);
	},

	async updateStatus(id: string, status: OrderStatus): Promise<Order | null> {
		const { error } = await supabase.from('orders').update({ status }).eq('id', id);
		if (error) throw error;
		return this.get(id);
	},

	async assign(id: string, staffId: string): Promise<Order | null> {
		const { error } = await supabase
			.from('orders')
			.update({ assigned_staff_id: staffId, assigned_staff_guest_id: null, status: 'ASIGNADO' })
			.eq('id', id);
		if (error) throw error;
		return this.get(id);
	},

	async assignGuest(id: string, staffGuestId: string): Promise<Order | null> {
		const { error } = await supabase
			.from('orders')
			.update({ assigned_staff_id: null, assigned_staff_guest_id: staffGuestId, status: 'ASIGNADO' })
			.eq('id', id);
		if (error) throw error;
		return this.get(id);
	},

	/** Quita la asignación del pedido y lo deja en NO_ASIGNADO. */
	async unassign(id: string): Promise<Order | null> {
		const { error } = await supabase
			.from('orders')
			.update({ assigned_staff_id: null, assigned_staff_guest_id: null, status: 'NO_ASIGNADO' })
			.eq('id', id);
		if (error) throw error;
		return this.get(id);
	},

	/** Elimina un pedido. Solo se puede eliminar si status es BORRADOR o CANCELADO. */
	async delete(id: string): Promise<void> {
		const order = await this.get(id);
		if (!order) return;
		if (order.status !== 'BORRADOR' && order.status !== 'CANCELADO') {
			throw new Error('Solo se pueden eliminar pedidos en borrador o cancelados');
		}
		const { error: delItems } = await supabase.from('order_items').delete().eq('order_id', id);
		if (delItems) throw delItems;
		const { error: delOrder } = await supabase.from('orders').delete().eq('id', id);
		if (delOrder) throw delOrder;
	}
};
