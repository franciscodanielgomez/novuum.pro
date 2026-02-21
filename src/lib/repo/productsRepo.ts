import { dbDelete, dbInsert, dbSelect, dbUpdate } from '$lib/data/db';

type ProductCategoryLink = {
	category_id: string;
	categories: { id: string; name: string } | Array<{ id: string; name: string }> | null;
};

export type ProductRow = {
	id: string;
	name: string;
	description: string;
	price: number;
	active: boolean;
	image_url?: string | null;
	product_categories?: ProductCategoryLink[];
};

export type CategoryOption = { id: string; name: string };
export type ProductGroupOption = { id: string; name: string };
export type ProductGroupAssignment = { group_id: string; max_select: number };

export const productsRepo = {
	list: () =>
		dbSelect<ProductRow[]>(
			'products',
			({ signal, client }) =>
				client
					.from('products')
					.select('id, name, description, price, active, image_url, product_categories(category_id, categories(id, name))')
					.order('name', { ascending: true })
					.abortSignal(signal),
			{ source: 'productsRepo.list' }
		),

	listCategories: () =>
		dbSelect<CategoryOption[]>(
			'categories',
			({ signal, client }) =>
				client
					.from('categories')
					.select('id, name')
					.eq('active', true)
					.order('sort_order', { ascending: true })
					.order('name', { ascending: true })
					.abortSignal(signal),
			{ source: 'productsRepo.listCategories' }
		),

	listGroups: () =>
		dbSelect<ProductGroupOption[]>(
			'product_groups',
			({ signal, client }) =>
				client
					.from('product_groups')
					.select('id, name')
					.eq('active', true)
					.order('sort_order', { ascending: true })
					.order('name', { ascending: true })
					.abortSignal(signal),
			{ source: 'productsRepo.listGroups' }
		),

	listAssignments: (productId: string, signal?: AbortSignal) =>
		dbSelect<ProductGroupAssignment[]>(
			'product_product_groups',
			({ signal: dbSignal, client }) =>
				client
					.from('product_product_groups')
					.select('group_id, max_select')
					.eq('product_id', productId)
					.abortSignal(signal ?? dbSignal),
			{ signal, source: 'productsRepo.listAssignments' }
		),

	updateProduct: (id: string, payload: Record<string, unknown>) =>
		dbUpdate(
			'products',
			payload,
			{ id },
			({ signal, client, payload, match }) =>
				client.from('products').update(payload).eq('id', match.id as string).abortSignal(signal),
			{ source: 'productsRepo.updateProduct' }
		),

	createProduct: (payload: Record<string, unknown>) =>
		dbInsert<{ id: string }>(
			'products',
			payload,
			({ signal, client, payload }) =>
				client.from('products').insert(payload).select('id').abortSignal(signal).single(),
			{ source: 'productsRepo.createProduct' }
		),

	setProductCategories: async (productId: string, categoryIds: string[]) => {
		await dbDelete(
			'product_categories',
			{ product_id: productId },
			({ signal, client, match }) =>
				client.from('product_categories').delete().eq('product_id', match.product_id as string).abortSignal(signal),
			{ source: 'productsRepo.clearProductCategories' }
		);
		if (categoryIds.length === 0) return;
		await dbInsert(
			'product_categories',
			categoryIds.map((category_id) => ({ product_id: productId, category_id })),
			({ signal, client, payload }) => client.from('product_categories').insert(payload).abortSignal(signal),
			{ source: 'productsRepo.setProductCategories' }
		);
	},

	setProductGroups: async (productId: string, groups: ProductGroupAssignment[]) => {
		await dbDelete(
			'product_product_groups',
			{ product_id: productId },
			({ signal, client, match }) =>
				client.from('product_product_groups').delete().eq('product_id', match.product_id as string).abortSignal(signal),
			{ source: 'productsRepo.clearProductGroups' }
		);
		if (groups.length === 0) return;
		await dbInsert(
			'product_product_groups',
			groups.map((g) => ({ product_id: productId, group_id: g.group_id, max_select: g.max_select })),
			({ signal, client, payload }) => client.from('product_product_groups').insert(payload).abortSignal(signal),
			{ source: 'productsRepo.setProductGroups' }
		);
	},

	deactivateProduct: (id: string) =>
		dbUpdate(
			'products',
			{ active: false, updated_at: new Date().toISOString() },
			{ id },
			({ signal, client, payload, match }) =>
				client.from('products').update(payload).eq('id', match.id as string).abortSignal(signal),
			{ source: 'productsRepo.deactivateProduct' }
		)
};

