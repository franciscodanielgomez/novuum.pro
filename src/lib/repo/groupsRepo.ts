import { dbDelete, dbInsert, dbSelect, dbUpdate } from '$lib/data/db';

export type GroupRow = {
	id: string;
	name: string;
	sort_order: number;
	active: boolean;
	created_at: string;
	updated_at: string;
};

export type GroupItemRow = {
	id: string;
	group_id: string;
	parent_id: string | null;
	name: string;
	sort_order: number;
	active: boolean;
	image_url: string | null;
	created_at: string;
	updated_at: string;
};

export const groupsRepo = {
	list: () =>
		dbSelect<GroupRow[]>(
			'product_groups',
			({ signal, client }) =>
				client
					.from('product_groups')
					.select('id, name, sort_order, active, created_at, updated_at')
					.order('sort_order', { ascending: true })
					.order('name', { ascending: true })
					.abortSignal(signal),
			{ source: 'groupsRepo.list' }
		),
	listByIds: (groupIds: string[], signal?: AbortSignal) =>
		groupIds.length === 0
			? Promise.resolve([] as GroupRow[])
			: dbSelect<GroupRow[]>(
					'product_groups',
					({ signal: dbSignal, client }) =>
						client
							.from('product_groups')
							.select('id, name, sort_order, active, created_at, updated_at')
							.in('id', groupIds)
							.order('sort_order', { ascending: true })
							.order('name', { ascending: true })
							.abortSignal(signal ?? dbSignal),
					{ signal, source: 'groupsRepo.listByIds' }
				),

	listItems: (groupId: string, signal?: AbortSignal) =>
		dbSelect<GroupItemRow[]>(
			'product_group_items',
			({ signal: dbSignal, client }) =>
				client
					.from('product_group_items')
					.select('id, group_id, parent_id, name, sort_order, active, image_url, created_at, updated_at')
					.eq('group_id', groupId)
					.order('sort_order', { ascending: true })
					.order('name', { ascending: true })
					.abortSignal(signal ?? dbSignal),
			{ signal, source: 'groupsRepo.listItems' }
		),
	listItemsByGroupIds: (groupIds: string[], signal?: AbortSignal) =>
		groupIds.length === 0
			? Promise.resolve([] as GroupItemRow[])
			: dbSelect<GroupItemRow[]>(
					'product_group_items',
					({ signal: dbSignal, client }) =>
						client
							.from('product_group_items')
							.select('id, group_id, parent_id, name, sort_order, active, image_url, created_at, updated_at')
							.in('group_id', groupIds)
							.order('sort_order', { ascending: true })
							.order('name', { ascending: true })
							.abortSignal(signal ?? dbSignal),
					{ signal, source: 'groupsRepo.listItemsByGroupIds' }
				),

	createGroup: (payload: { name: string; sort_order: number; active: boolean }) =>
		dbInsert(
			'product_groups',
			payload,
			({ signal, client, payload }) => client.from('product_groups').insert(payload).abortSignal(signal),
			{ source: 'groupsRepo.createGroup' }
		),
	updateGroup: (id: string, payload: { name: string; sort_order: number; active: boolean; updated_at: string }) =>
		dbUpdate(
			'product_groups',
			payload,
			{ id },
			({ signal, client, payload, match }) =>
				client.from('product_groups').update(payload).eq('id', match.id as string).abortSignal(signal),
			{ source: 'groupsRepo.updateGroup' }
		),
	removeGroup: (id: string) =>
		dbDelete(
			'product_groups',
			{ id },
			({ signal, client, match }) =>
				client.from('product_groups').delete().eq('id', match.id as string).abortSignal(signal),
			{ source: 'groupsRepo.removeGroup' }
		),

	createItem: (payload: {
		group_id: string;
		parent_id: string | null;
		name: string;
		sort_order: number;
		active: boolean;
	}) =>
		dbInsert(
			'product_group_items',
			payload,
			({ signal, client, payload }) => client.from('product_group_items').insert(payload).abortSignal(signal),
			{ source: 'groupsRepo.createItem' }
		),
	updateItem: (id: string, payload: { name: string; image_url: string | null; updated_at: string }) =>
		dbUpdate(
			'product_group_items',
			payload,
			{ id },
			({ signal, client, payload, match }) =>
				client.from('product_group_items').update(payload).eq('id', match.id as string).abortSignal(signal),
			{ source: 'groupsRepo.updateItem' }
		),
	removeItem: (id: string) =>
		dbDelete(
			'product_group_items',
			{ id },
			({ signal, client, match }) =>
				client.from('product_group_items').delete().eq('id', match.id as string).abortSignal(signal),
			{ source: 'groupsRepo.removeItem' }
		)
};

