import { dbDelete, dbInsert, dbSelect } from '$lib/data/db';

export type PaymentMethodRow = {
	id: string;
	name: string;
	sort_order: number | null;
	active: boolean | null;
};

export const paymentMethodsRepo = {
	listActive: async (): Promise<PaymentMethodRow[]> =>
		dbSelect<PaymentMethodRow[]>(
			'payment_methods',
			({ signal, client }) =>
				client
					.from('payment_methods')
					.select('id, name, sort_order, active')
					.eq('active', true)
					.order('sort_order', { ascending: true })
					.abortSignal(signal),
			{ source: 'paymentMethodsRepo.listActive' }
		),

	create: async (payload: { name: string; sort_order: number; active: boolean }): Promise<PaymentMethodRow> =>
		dbInsert<PaymentMethodRow>(
			'payment_methods',
			payload,
			({ signal, client, payload: row }) =>
				client
					.from('payment_methods')
					.insert(row)
					.select('id, name, sort_order, active')
					.abortSignal(signal)
					.single(),
			{ source: 'paymentMethodsRepo.create' }
		),

	remove: async (id: string): Promise<void> =>
		dbDelete(
			'payment_methods',
			{ id },
			({ signal, client, match }) =>
				client.from('payment_methods').delete().eq('id', match.id as string).abortSignal(signal),
			{ source: 'paymentMethodsRepo.remove' }
		)
};
