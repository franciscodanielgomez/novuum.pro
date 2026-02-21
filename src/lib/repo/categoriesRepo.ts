import { dbDelete, dbInsert, dbSelect, dbUpdate } from '$lib/data/db';

export type CategoryRow = {
	id: string;
	name: string;
	sort_order: number;
	active: boolean;
	created_at: string;
	updated_at: string;
};

export const categoriesRepo = {
	list: () =>
		dbSelect<CategoryRow[]>(
			'categories',
			({ signal, client }) =>
				client
					.from('categories')
					.select('id, name, sort_order, active, created_at, updated_at')
					.order('sort_order', { ascending: true })
					.order('name', { ascending: true })
					.abortSignal(signal),
			{ source: 'categoriesRepo.list' }
		),
	create: (payload: { name: string; sort_order: number; active: boolean }) =>
		dbInsert(
			'categories',
			payload,
			({ signal, client, payload }) => client.from('categories').insert(payload).abortSignal(signal),
			{ source: 'categoriesRepo.create' }
		),
	update: (id: string, payload: { name: string; sort_order: number; active: boolean; updated_at: string }) =>
		dbUpdate(
			'categories',
			payload,
			{ id },
			({ signal, client, payload, match }) =>
				client.from('categories').update(payload).eq('id', match.id as string).abortSignal(signal),
			{ source: 'categoriesRepo.update' }
		),
	remove: (id: string) =>
		dbDelete(
			'categories',
			{ id },
			({ signal, client, match }) => client.from('categories').delete().eq('id', match.id as string).abortSignal(signal),
			{ source: 'categoriesRepo.remove' }
		)
};

