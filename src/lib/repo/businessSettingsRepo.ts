import { dbInsert, dbSelect, dbUpdate } from '$lib/data/db';

export type BusinessSettingsRow = {
	id: string;
	company_name: string | null;
	branch_name: string | null;
	logo_url: string | null;
	shipping_price: number | null;
	phone: string | null;
	ticket_font_size_pt: number | null;
	ticket_margin_left: number | null;
	ticket_margin_right: number | null;
};

type BusinessSettingsPayload = {
	company_name: string;
	branch_name: string;
	logo_url: string | null;
	shipping_price: number;
	phone: string | null;
	ticket_font_size_pt: number;
	ticket_margin_left: number;
	ticket_margin_right: number;
};

export const businessSettingsRepo = {
	getFirst: (): Promise<BusinessSettingsRow | null> =>
		dbSelect<BusinessSettingsRow | null>(
			'business_settings',
			({ signal, client }) =>
				client
					.from('business_settings')
					.select(
						'id, company_name, branch_name, logo_url, shipping_price, phone, ticket_font_size_pt, ticket_margin_left, ticket_margin_right'
					)
					.order('created_at', { ascending: true })
					.limit(1)
					.abortSignal(signal)
					.maybeSingle(),
			{ source: 'businessSettingsRepo.getFirst' }
		),
	updateById: (id: string, payload: Partial<BusinessSettingsPayload>): Promise<void> =>
		dbUpdate(
			'business_settings',
			payload,
			{ id },
			({ signal, client, payload: row, match }) =>
				client.from('business_settings').update(row).eq('id', match.id as string).abortSignal(signal),
			{ source: 'businessSettingsRepo.updateById' }
		).then(() => undefined),
	insert: (payload: BusinessSettingsPayload): Promise<BusinessSettingsRow> =>
		dbInsert<BusinessSettingsRow>(
			'business_settings',
			payload,
			({ signal, client, payload: row }) =>
				client
					.from('business_settings')
					.insert(row)
					.select(
						'id, company_name, branch_name, logo_url, shipping_price, phone, ticket_font_size_pt, ticket_margin_left, ticket_margin_right'
					)
					.abortSignal(signal)
					.single(),
			{ source: 'businessSettingsRepo.insert' }
		)
};
