import { dbDelete, dbInsert, dbSelect, dbUpdate } from '$lib/data/db';
import type { Customer } from '$lib/types';

type Row = {
	id: string;
	phone: string;
	address: string;
	between_streets: string | null;
	notes: string | null;
	created_at: string;
};

function rowToCustomer(row: Row): Customer {
	return {
		id: row.id,
		phone: row.phone,
		address: row.address,
		betweenStreets: row.between_streets ?? undefined,
		notes: row.notes ?? undefined,
		createdAt: row.created_at
	};
}

export const customersRepo = {
	async list(signal?: AbortSignal): Promise<Customer[]> {
		const data = await dbSelect<Row[]>(
			'customers',
			({ signal: dbSignal, client }) =>
				client
					.from('customers')
					.select('id, phone, address, between_streets, notes, created_at')
					.order('created_at', { ascending: false })
					.abortSignal(signal ?? dbSignal),
			{ signal, source: 'customersRepo.list' }
		);
		return (data ?? []).map(rowToCustomer);
	},

	async create(payload: Omit<Customer, 'id' | 'createdAt'>): Promise<Customer> {
		const data = await dbInsert<Row>(
			'customers',
			{
				phone: payload.phone,
				address: payload.address,
				between_streets: payload.betweenStreets?.trim() || null,
				notes: payload.notes?.trim() || null
			},
			({ signal, client, payload: row }) =>
				client
					.from('customers')
					.insert(row)
					.select('id, phone, address, between_streets, notes, created_at')
					.abortSignal(signal)
					.single(),
			{ source: 'customersRepo.create' }
		);
		return rowToCustomer(data);
	},

	async update(id: string, payload: Partial<Omit<Customer, 'id' | 'createdAt'>>): Promise<Customer | null> {
		const updates: Partial<Record<keyof Row, unknown>> = {};
		if (payload.phone !== undefined) updates.phone = payload.phone;
		if (payload.address !== undefined) updates.address = payload.address;
		if (payload.betweenStreets !== undefined) updates.between_streets = payload.betweenStreets?.trim() || null;
		if (payload.notes !== undefined) updates.notes = payload.notes?.trim() || null;

		if (Object.keys(updates).length === 0) {
			const data = await dbSelect<Row | null>(
				'customers',
				({ signal, client }) =>
					client
						.from('customers')
						.select('id, phone, address, between_streets, notes, created_at')
						.eq('id', id)
						.abortSignal(signal)
						.maybeSingle(),
				{ source: 'customersRepo.getById' }
			);
			return data ? rowToCustomer(data) : null;
		}

		const data = await dbUpdate<Row | null>(
			'customers',
			updates,
			{ id },
			({ signal, client, payload, match }) =>
				client
					.from('customers')
					.update(payload)
					.eq('id', match.id as string)
					.select('id, phone, address, between_streets, notes, created_at')
					.abortSignal(signal)
					.maybeSingle(),
			{ source: 'customersRepo.update' }
		);
		return data ? rowToCustomer(data) : null;
	},

	async remove(id: string): Promise<void> {
		await dbDelete(
			'customers',
			{ id },
			({ signal, client, match }) => client.from('customers').delete().eq('id', match.id as string).abortSignal(signal),
			{ source: 'customersRepo.remove' }
		);
	}
};

