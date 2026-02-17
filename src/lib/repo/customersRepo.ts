import type { Customer } from '$lib/types';
import { supabase } from '$lib/supabase/client';

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
	async list(): Promise<Customer[]> {
		const { data, error } = await supabase
			.from('customers')
			.select('id, phone, address, between_streets, notes, created_at')
			.order('created_at', { ascending: false });
		if (error) throw error;
		return (data ?? []).map(rowToCustomer);
	},

	async create(payload: Omit<Customer, 'id' | 'createdAt'>): Promise<Customer> {
		const { data, error } = await supabase
			.from('customers')
			.insert({
				phone: payload.phone,
				address: payload.address,
				between_streets: payload.betweenStreets?.trim() || null,
				notes: payload.notes?.trim() || null
			})
			.select('id, phone, address, between_streets, notes, created_at')
			.single();
		if (error) throw error;
		return rowToCustomer(data as Row);
	},

	async update(id: string, payload: Partial<Omit<Customer, 'id' | 'createdAt'>>): Promise<Customer | null> {
		const updates: Partial<Record<keyof Row, unknown>> = {};
		if (payload.phone !== undefined) updates.phone = payload.phone;
		if (payload.address !== undefined) updates.address = payload.address;
		if (payload.betweenStreets !== undefined) updates.between_streets = payload.betweenStreets?.trim() || null;
		if (payload.notes !== undefined) updates.notes = payload.notes?.trim() || null;
		if (Object.keys(updates).length === 0) {
			const { data } = await supabase
				.from('customers')
				.select('id, phone, address, between_streets, notes, created_at')
				.eq('id', id)
				.single();
			return data ? rowToCustomer(data as Row) : null;
		}
		const { data, error } = await supabase
			.from('customers')
			.update(updates)
			.eq('id', id)
			.select('id, phone, address, between_streets, notes, created_at')
			.single();
		if (error) throw error;
		return data ? rowToCustomer(data as Row) : null;
	},

	async remove(id: string): Promise<void> {
		const { error } = await supabase.from('customers').delete().eq('id', id);
		if (error) throw error;
	}
};
