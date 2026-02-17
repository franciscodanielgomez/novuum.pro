import type { StaffGuest, StaffRole } from '$lib/types';
import { supabase } from '$lib/supabase/client';

type Row = {
	id: string;
	name: string;
	role: string;
	roles?: string[] | null;
	email: string | null;
	phone: string | null;
	active: boolean;
};

function rowToGuest(row: Row): StaffGuest {
	const rolesArr = Array.isArray(row.roles) && row.roles.length > 0
		? (row.roles as StaffRole[])
		: [row.role as StaffRole];
	return {
		id: row.id,
		name: row.name,
		role: rolesArr[0] as StaffRole,
		roles: rolesArr,
		email: row.email ?? undefined,
		phone: row.phone ?? undefined,
		active: Boolean(row.active)
	};
}

export const staffGuestsRepo = {
	async list(): Promise<StaffGuest[]> {
		const { data, error } = await supabase
			.from('staff_guests')
			.select('id, name, role, roles, email, phone, active')
			.order('name', { ascending: true });
		if (error) throw error;
		return (data ?? []).map((r) => rowToGuest(r as Row));
	},

	async create(payload: Omit<StaffGuest, 'id'>): Promise<StaffGuest> {
		const roles = payload.roles ?? [payload.role];
		const { data, error } = await supabase
			.from('staff_guests')
			.insert({
				name: payload.name,
				role: roles[0],
				roles,
				email: payload.email?.trim() || null,
				phone: payload.phone?.trim() || null,
				active: payload.active ?? true
			})
			.select('id, name, role, roles, email, phone, active')
			.single();
		if (error) throw error;
		return rowToGuest(data as Row);
	},

	async update(id: string, payload: Partial<Omit<StaffGuest, 'id'>>): Promise<StaffGuest | null> {
		const updates: Partial<Record<keyof Row, unknown>> = {};
		if (payload.name !== undefined) updates.name = payload.name;
		if (payload.roles !== undefined && payload.roles.length > 0) {
			updates.roles = payload.roles;
			updates.role = payload.roles[0];
		} else if (payload.role !== undefined) {
			updates.role = payload.role;
			updates.roles = [payload.role];
		}
		if (payload.email !== undefined) updates.email = payload.email?.trim() || null;
		if (payload.phone !== undefined) updates.phone = payload.phone?.trim() || null;
		if (payload.active !== undefined) updates.active = payload.active;
		if (Object.keys(updates).length === 0) return this.get(id);
		const { data, error } = await supabase
			.from('staff_guests')
			.update(updates)
			.eq('id', id)
			.select('id, name, role, roles, email, phone, active')
			.single();
		if (error) throw error;
		return data ? rowToGuest(data as Row) : null;
	},

	async get(id: string): Promise<StaffGuest | null> {
		const { data, error } = await supabase
			.from('staff_guests')
			.select('id, name, role, roles, email, phone, active')
			.eq('id', id)
			.single();
		if (error || !data) return null;
		return rowToGuest(data as Row);
	},

	async remove(id: string): Promise<void> {
		const { error } = await supabase.from('staff_guests').delete().eq('id', id);
		if (error) throw error;
	}
};
