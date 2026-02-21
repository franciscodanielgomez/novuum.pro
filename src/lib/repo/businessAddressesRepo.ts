import { dbDelete, dbInsert, dbSelect, dbUpdate } from '$lib/data/db';

export type BusinessAddressRow = {
	id: string;
	label: string | null;
	address_line: string | null;
	city: string | null;
	state: string | null;
	postal_code: string | null;
	country: string | null;
	is_primary: boolean | null;
};

type InsertBusinessAddressPayload = {
	business_settings_id: string;
	label: string;
	address_line: string;
	city: string | null;
	state: string | null;
	postal_code: string | null;
	country: string | null;
	is_primary: boolean;
};

export const businessAddressesRepo = {
	listByBusinessSettingsId: (businessSettingsId: string): Promise<BusinessAddressRow[]> =>
		dbSelect<BusinessAddressRow[]>(
			'business_addresses',
			({ signal, client }) =>
				client
					.from('business_addresses')
					.select('id, label, address_line, city, state, postal_code, country, is_primary')
					.eq('business_settings_id', businessSettingsId)
					.order('is_primary', { ascending: false })
					.order('created_at', { ascending: true })
					.abortSignal(signal),
			{ source: 'businessAddressesRepo.listByBusinessSettingsId' }
		),
	create: (payload: InsertBusinessAddressPayload): Promise<void> =>
		dbInsert(
			'business_addresses',
			payload,
			({ signal, client, payload: row }) => client.from('business_addresses').insert(row).abortSignal(signal),
			{ source: 'businessAddressesRepo.create' }
		).then(() => undefined),
	removeById: (id: string): Promise<void> =>
		dbDelete(
			'business_addresses',
			{ id },
			({ signal, client, match }) =>
				client.from('business_addresses').delete().eq('id', match.id as string).abortSignal(signal),
			{ source: 'businessAddressesRepo.removeById' }
		),
	clearPrimaryBySettingsId: (businessSettingsId: string): Promise<void> =>
		dbUpdate(
			'business_addresses',
			{ is_primary: false },
			{ business_settings_id: businessSettingsId },
			({ signal, client, payload: row, match }) =>
				client
					.from('business_addresses')
					.update(row)
					.eq('business_settings_id', match.business_settings_id as string)
					.abortSignal(signal),
			{ source: 'businessAddressesRepo.clearPrimaryBySettingsId' }
		).then(() => undefined),
	setPrimaryById: (id: string): Promise<void> =>
		dbUpdate(
			'business_addresses',
			{ is_primary: true },
			{ id },
			({ signal, client, payload: row, match }) =>
				client.from('business_addresses').update(row).eq('id', match.id as string).abortSignal(signal),
			{ source: 'businessAddressesRepo.setPrimaryById' }
		).then(() => undefined)
};
