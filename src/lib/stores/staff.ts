import { api } from '$lib/api';
import { supabase } from '$lib/supabase/client';
import type { Staff } from '$lib/types';
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
			role: 'CAJERO',
			active: true
		},
		...members
	];
};

export const staffStore = {
	subscribe: staff.subscribe,
	load: async () => {
		const { data, error } = await supabase
			.from('team_members')
			.select('id, full_name, email, role, active')
			.order('created_at', { ascending: false });

		if (!error && data) {
			const mapped = data.map((row) => ({
					id: row.id,
					name: row.full_name ?? row.email ?? 'Usuario',
					email: row.email ?? undefined,
					role: mapLegacyRole(row.role),
					active: Boolean(row.active)
				}));
			staff.set(await ensureCurrentUserVisible(mapped));
			return;
		}

		// Fallback local para entorno sin tablas Supabase creadas.
		staff.set(await ensureCurrentUserVisible(await api.staff.list()));
	},
	create: async (payload: Omit<Staff, 'id'>) => {
		await api.staff.create(payload);
		await staffStore.load();
	},
	update: async (id: string, payload: Partial<Staff>) => {
		const { error } = await supabase
			.from('team_members')
			.update({
				full_name: payload.name,
				role: payload.role,
				active: payload.active
			})
			.eq('id', id);

		if (error) {
			await api.staff.update(id, payload);
		}
		await staffStore.load();
	}
};
