import { dbInsert, dbSelect, dbUpdate } from '$lib/data/db';

export type UserProfileRow = {
	id: string;
	first_name: string | null;
	last_name: string | null;
	phone: string | null;
	reference_phone: string | null;
	avatar_url: string | null;
};

type ProfilePayload = {
	id: string;
	first_name: string | null;
	last_name: string | null;
	phone: string | null;
	reference_phone: string | null;
	avatar_url: string | null;
};

export const userProfilesRepo = {
	getById: (id: string): Promise<UserProfileRow | null> =>
		dbSelect<UserProfileRow | null>(
			'user_profiles',
			({ signal, client }) =>
				client
					.from('user_profiles')
					.select('first_name, last_name, phone, reference_phone, avatar_url')
					.eq('id', id)
					.abortSignal(signal)
					.maybeSingle(),
			{ source: 'userProfilesRepo.getById' }
		),
	updateById: (id: string, payload: Omit<ProfilePayload, 'id'>): Promise<Array<{ id: string }>> =>
		dbUpdate<Array<{ id: string }>>(
			'user_profiles',
			payload,
			{ id },
			({ signal, client, payload: row, match }) =>
				client
					.from('user_profiles')
					.update(row)
					.eq('id', match.id as string)
					.select('id')
					.abortSignal(signal),
			{ source: 'userProfilesRepo.updateById' }
		),
	insert: (payload: ProfilePayload): Promise<void> =>
		dbInsert(
			'user_profiles',
			payload,
			({ signal, client, payload: row }) => client.from('user_profiles').insert(row).abortSignal(signal),
			{ source: 'userProfilesRepo.insert' }
		).then(() => undefined)
};
