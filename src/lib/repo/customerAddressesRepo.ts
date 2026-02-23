import { dbDelete, dbInsert, dbSelect, dbUpdate } from '$lib/data/db';

export type CustomerAddressRow = {
	id: string;
	customer_id: string;
	address_line: string;
	between_streets: string | null;
	notes: string | null;
	created_at: string;
	updated_at: string;
};

export type CustomerAddress = {
	id: string;
	customerId: string;
	addressLine: string;
	betweenStreets?: string;
	notes?: string;
	createdAt: string;
	updatedAt: string;
};

function rowToAddress(row: CustomerAddressRow): CustomerAddress {
	return {
		id: row.id,
		customerId: row.customer_id,
		addressLine: row.address_line,
		betweenStreets: row.between_streets ?? undefined,
		notes: row.notes ?? undefined,
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}

export const customerAddressesRepo = {
	/**
	 * Busca en direcciones secundarias (address_line, between_streets, notes) y devuelve los customer_id que coinciden.
	 */
	async searchCustomerIdsByText(query: string, signal?: AbortSignal): Promise<string[]> {
		const q = String(query ?? '').trim();
		if (!q) return [];
		const pattern = `%${q.replace(/"/g, '""')}%`;
		const quoted = `"${pattern}"`;
		const orFilter = `address_line.ilike.${quoted},between_streets.ilike.${quoted},notes.ilike.${quoted}`;
		const rows = await dbSelect<{ customer_id: string }[]>(
			'customer_addresses',
			({ signal: dbSignal, client }) =>
				client
					.from('customer_addresses')
					.select('customer_id')
					.or(orFilter)
					.abortSignal(signal ?? dbSignal),
			{ signal, source: 'customerAddressesRepo.searchCustomerIdsByText' }
		);
		const ids = [...new Set((rows ?? []).map((r) => r.customer_id))];
		return ids;
	},

	async listByCustomerId(customerId: string, signal?: AbortSignal): Promise<CustomerAddress[]> {
		const rows = await dbSelect<CustomerAddressRow[]>(
			'customer_addresses',
			({ signal: dbSignal, client }) =>
				client
					.from('customer_addresses')
					.select('id, customer_id, address_line, between_streets, notes, created_at, updated_at')
					.eq('customer_id', customerId)
					.order('created_at', { ascending: true })
					.abortSignal(signal ?? dbSignal),
			{ signal, source: 'customerAddressesRepo.listByCustomerId' }
		);
		return (rows ?? []).map(rowToAddress);
	},

	async create(
		payload: {
			customerId: string;
			addressLine: string;
			betweenStreets?: string;
			notes?: string;
		},
		signal?: AbortSignal
	): Promise<CustomerAddress> {
		const row = await dbInsert<CustomerAddressRow>(
			'customer_addresses',
			{
				customer_id: payload.customerId,
				address_line: payload.addressLine.trim(),
				between_streets: payload.betweenStreets?.trim() || null,
				notes: payload.notes?.trim() || null
			},
			undefined,
			{ signal, source: 'customerAddressesRepo.create' }
		);
		return rowToAddress(row);
	},

	async update(
		id: string,
		payload: { addressLine?: string; betweenStreets?: string; notes?: string },
		signal?: AbortSignal
	): Promise<CustomerAddress | null> {
		const updates: Record<string, unknown> = {};
		if (payload.addressLine !== undefined) updates.address_line = payload.addressLine.trim();
		if (payload.betweenStreets !== undefined)
			updates.between_streets = payload.betweenStreets?.trim() || null;
		if (payload.notes !== undefined) updates.notes = payload.notes?.trim() || null;
		if (Object.keys(updates).length === 0) return null;
		const row = await dbUpdate<CustomerAddressRow>(
			'customer_addresses',
			updates,
			{ id },
			({ signal: dbSignal, client, payload: p, match }) =>
				client.from('customer_addresses').update(p).eq('id', match.id as string).select().abortSignal(signal ?? dbSignal).single(),
			{ signal, source: 'customerAddressesRepo.update' }
		);
		return row ? rowToAddress(row) : null;
	},

	async remove(id: string, signal?: AbortSignal): Promise<void> {
		await dbDelete(
			'customer_addresses',
			{ id },
			({ signal: dbSignal, client, match }) =>
				client.from('customer_addresses').delete().eq('id', match.id as string).abortSignal(signal ?? dbSignal),
			{ signal, source: 'customerAddressesRepo.remove' }
		);
	}
};
