import { dbDelete, dbInsert, dbSelect } from '$lib/data/db';

export type UserAddressRow = {
	id: string;
	label: string | null;
	address_line: string | null;
	city: string | null;
	state: string | null;
	postal_code: string | null;
	country: string | null;
};

type InsertUserAddressPayload = {
	user_id: string;
	label: string;
	address_line: string;
	city: string | null;
	state: string | null;
	postal_code: string | null;
	country: string | null;
};

export const userAddressesRepo = {
	listByUserId: (userId: string): Promise<UserAddressRow[]> =>
		dbSelect<UserAddressRow[]>(
			'user_addresses',
			({ signal, client }) =>
				client
					.from('user_addresses')
					.select('id, label, address_line, city, state, postal_code, country')
					.eq('user_id', userId)
					.order('created_at', { ascending: true })
					.abortSignal(signal),
			{ source: 'userAddressesRepo.listByUserId' }
		),
	create: (payload: InsertUserAddressPayload): Promise<void> =>
		dbInsert(
			'user_addresses',
			payload,
			({ signal, client, payload: row }) => client.from('user_addresses').insert(row).abortSignal(signal),
			{ source: 'userAddressesRepo.create' }
		).then(() => undefined),
	removeById: (id: string): Promise<void> =>
		dbDelete(
			'user_addresses',
			{ id },
			({ signal, client, match }) =>
				client.from('user_addresses').delete().eq('id', match.id as string).abortSignal(signal),
			{ source: 'userAddressesRepo.removeById' }
		)
};
