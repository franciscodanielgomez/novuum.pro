import { api } from '$lib/api';
import { supabase } from '$lib/supabase/client';
import type { Staff, StaffRole } from '$lib/types';
import { writable } from 'svelte/store';

const staff = writable<Staff[]>([]);

const mapLegacyRole = (role: string | null | undefined): Staff['role'] => {
	if (role === 'CAJA') return 'CAJERO';
	if (role === 'ADMIN') return 'ADMINISTRADOR';
	if (role === 'CADETE') return 'CADETE';
	if (role === 'GESTOR') return 'GESTOR';
	if (role === 'ADMINISTRADOR') return 'ADMINISTRADOR';
	return 'CAJERO';
};

const ensureCurrentUserVisible = async (members: Staff[]): Promise<Staff[]> => {
	const {
		data: { user }
	} = await supabase.auth.getUser();

	if (!user?.id) return members;
	if (members.some((member) => member.id === user.id)) return members;

	return [
		{
			id: user.id,
			name: (user.user_metadata?.name as string | undefined) ?? user.email ?? 'Usuario',
			email: user.email ?? undefined,
			phone: undefined,
			role: 'CAJERO',
			roles: ['CAJERO'],
			active: true
		},
		...members
	];
};

export const staffStore = {
	subscribe: staff.subscribe,
	load: async () => {
		try {
			const { data, error } = await supabase
				.from('team_members')
				.select('id, full_name, email, phone, role, roles, active')
				.order('created_at', { ascending: false });

			if (!error && data) {
				const mapped = data.map((row: { id: string; full_name: string | null; email: string | null; phone?: string | null; role: string | null; roles?: string[] | null; active: boolean | null }) => {
					const rolesArr = Array.isArray(row.roles) && row.roles.length > 0
						? (row.roles as Staff['roles'])
						: [mapLegacyRole(row.role)];
					return {
						id: row.id,
						name: row.full_name ?? row.email ?? 'Usuario',
						email: row.email ?? undefined,
						phone: row.phone ?? undefined,
						role: mapLegacyRole(rolesArr[0] ?? row.role),
						roles: rolesArr,
						active: Boolean(row.active)
					};
				});
				try {
					staff.set(await ensureCurrentUserVisible(mapped));
				} catch {
					staff.set(mapped);
				}
				return;
			}
		} catch {
			// Supabase falló (red, permisos, etc.): usar fallback local.
		}
		// Fallback local para entorno sin tablas Supabase o sin acceso.
		try {
			staff.set(await ensureCurrentUserVisible(await api.staff.list()));
		} catch {
			staff.set([]);
		}
	},
	create: async (payload: Omit<Staff, 'id'>) => {
		await api.staff.create(payload);
		await staffStore.load();
	},
	update: async (id: string, payload: Partial<Staff>) => {
		const roles = payload.roles ?? (payload.role != null ? [payload.role] : undefined);
		const updatePayload: Record<string, unknown> = {
			full_name: payload.name,
			active: payload.active
		};
		if (payload.email !== undefined) updatePayload.email = payload.email.trim() || null;
		if (payload.phone !== undefined) updatePayload.phone = payload.phone.trim() || null;
		if (roles !== undefined && roles.length > 0) {
			updatePayload.roles = roles;
			updatePayload.role = roles[0] as StaffRole;
		} else if (payload.role !== undefined) {
			updatePayload.role = payload.role;
			updatePayload.roles = [payload.role];
		}
		const { error } = await supabase
			.from('team_members')
			.update(updatePayload)
			.eq('id', id);

		if (error) {
			try {
				await api.staff.update(id, payload);
				await staffStore.load();
				return;
			} catch {
				throw new Error(error.message || 'No se pudo actualizar. En Supabase ejecutá la migración que permite editar tu propio rol.');
			}
		}
		await staffStore.load();
	},
	remove: async (id: string) => {
		const { error } = await supabase.from('team_members').delete().eq('id', id);
		if (error) throw new Error(error.message || 'No se pudo eliminar del equipo.');
		await staffStore.load();
	}
};
