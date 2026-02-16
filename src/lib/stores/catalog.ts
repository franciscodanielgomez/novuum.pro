import { api } from '$lib/api';
import type { Product, ProductCategory, SKU } from '$lib/types';
import { writable } from 'svelte/store';

type CatalogState = {
	categories: ProductCategory[];
	products: Product[];
	skus: SKU[];
};

const state = writable<CatalogState>({ categories: [], products: [], skus: [] });

export const catalogStore = {
	subscribe: state.subscribe,
	load: async () => {
		const [categories, products, skus] = await Promise.all([
			api.catalog.listCategories(),
			api.catalog.listProducts(),
			api.catalog.listSkus()
		]);
		state.set({ categories, products, skus });
	},
	updatePrice: async (skuId: string, price: number) => {
		await api.catalog.updateSkuPrice(skuId, price);
		await catalogStore.load();
	}
};
