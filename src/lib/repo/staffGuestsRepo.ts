import { dbDelete, dbInsert, dbSelect, dbUpdate } from '$lib/data/db';
import type { StaffGuest, StaffRole } from '$lib/types';

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
	const rolesArr =
		Array.isArray(row.roles) && row.roles.length > 0
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
	async list(signal?: AbortSignal): Promise<StaffGuest[]> {
		const data = await dbSelect<Row[]>(
			'staff_guests',
			({ signal: dbSignal, client }) =>
				client
					.from('staff_guests')
					.select('id, name, role, roles, email, phone, active')
					.order('name', { ascending: true })
					.abortSignal(signal ?? dbSignal),
			{ signal, source: 'staffGuestsRepo.list' }
		);
		return (data ?? []).map((r) => rowToGuest(r as Row));
	},

	async create(payload: Omit<StaffGuest, 'id'>): Promise<StaffGuest> {
		const roles = payload.roles ?? [payload.role];
		const data = await dbInsert<Row>(
			'staff_guests',
			{
				name: payload.name,
				role: roles[0],
				roles,
				email: payload.email?.trim() || null,
				phone: payload.phone?.trim() || null,
				active: payload.active ?? true
			},
			({ signal, client, payload: row }) =>
				client
					.from('staff_guests')
					.insert(row)
					.select('id, name, role, roles, email, phone, active')
					.abortSignal(signal)
					.single(),
			{ source: 'staffGuestsRepo.create' }
		);
		return rowToGuest(data);
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

		const data = await dbUpdate<Row | null>(
			'staff_guests',
			updates,
			{ id },
			({ signal, client, payload, match }) =>
				client
					.from('staff_guests')
					.update(payload)
					.eq('id', match.id as string)
					.select('id, name, role, roles, email, phone, active')
					.abortSignal(signal)
					.maybeSingle(),
			{ source: 'staffGuestsRepo.update' }
		);
		return data ? rowToGuest(data) : null;
	},

	async get(id: string): Promise<StaffGuest | null> {
		const data = await dbSelect<Row | null>(
			'staff_guests',
			({ signal, client }) =>
				client
					.from('staff_guests')
					.select('id, name, role, roles, email, phone, active')
					.eq('id', id)
					.abortSignal(signal)
					.maybeSingle(),
			{ source: 'staffGuestsRepo.get' }
		);
		return data ? rowToGuest(data) : null;
	},

	async remove(id: string): Promise<void> {
		await dbDelete(
			'staff_guests',
			{ id },
			({ signal, client, match }) =>
				client.from('staff_guests').delete().eq('id', match.id as string).abortSignal(signal),
			{ source: 'staffGuestsRepo.remove' }
		);
	}
};

