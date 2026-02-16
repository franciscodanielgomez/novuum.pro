import type { Product, ProductCategory, SKU } from '$lib/types';
import { readStorage, writeStorage } from './storage';
import { seedCategories, seedProducts, seedSkus } from './seeds';

const KEY_CATEGORIES = 'categories';
const KEY_PRODUCTS = 'products';
const KEY_SKUS = 'skus';

const ensure = () => {
	const categories = readStorage<ProductCategory[]>(KEY_CATEGORIES, []);
	const products = readStorage<Product[]>(KEY_PRODUCTS, []);
	const skus = readStorage<SKU[]>(KEY_SKUS, []);
	if (!categories.length || !products.length || !skus.length) {
		writeStorage(KEY_CATEGORIES, seedCategories);
		writeStorage(KEY_PRODUCTS, seedProducts);
		writeStorage(KEY_SKUS, seedSkus);
		return { categories: seedCategories, products: seedProducts, skus: seedSkus };
	}
	return { categories, products, skus };
};

export const catalogRepo = {
	async listCategories() {
		return ensure().categories.sort((a, b) => a.sort - b.sort);
	},
	async listProducts() {
		return ensure().products;
	},
	async listSkus() {
		return ensure().skus;
	},
	async updateSkuPrice(id: string, price: number) {
		const { skus } = ensure();
		const next = skus.map((sku) => (sku.id === id ? { ...sku, price } : sku));
		writeStorage(KEY_SKUS, next);
		return next.find((sku) => sku.id === id) ?? null;
	}
};
