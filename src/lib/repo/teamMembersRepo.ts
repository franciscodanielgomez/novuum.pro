import { dbDelete, dbSelect, dbUpdate } from '$lib/data/db';

export type TeamMemberRow = {
	id: string;
	full_name: string | null;
	email: string | null;
	phone: string | null;
	role: string | null;
	roles: string[] | null;
	active: boolean | null;
};

export const teamMembersRepo = {
	list: (): Promise<TeamMemberRow[]> =>
		dbSelect<TeamMemberRow[]>(
			'team_members',
			({ signal, client }) =>
				client
					.from('team_members')
					.select('id, full_name, email, phone, role, roles, active')
					.order('created_at', { ascending: false })
					.abortSignal(signal),
			{ source: 'teamMembersRepo.list' }
		),
	getById: (id: string): Promise<Pick<TeamMemberRow, 'role' | 'roles'> | null> =>
		dbSelect<Pick<TeamMemberRow, 'role' | 'roles'> | null>(
			'team_members',
			({ signal, client }) =>
				client
					.from('team_members')
					.select('role, roles')
					.eq('id', id)
					.abortSignal(signal)
					.maybeSingle(),
			{ source: 'teamMembersRepo.getById' }
		),
	updateById: (id: string, payload: Record<string, unknown>): Promise<void> =>
		dbUpdate(
			'team_members',
			payload,
			{ id },
			({ signal, client, payload: row, match }) =>
				client.from('team_members').update(row).eq('id', match.id as string).abortSignal(signal),
			{ source: 'teamMembersRepo.updateById' }
		).then(() => undefined),
	removeById: (id: string): Promise<void> =>
		dbDelete(
			'team_members',
			{ id },
			({ signal, client, match }) =>
				client.from('team_members').delete().eq('id', match.id as string).abortSignal(signal),
			{ source: 'teamMembersRepo.removeById' }
		)
};
