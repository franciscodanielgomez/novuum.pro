import { browser } from '$app/environment';
import { generateId, isoNow } from '$lib/utils';
import { createStore } from 'zustand/vanilla';
import type { Product, ProductOption, ProductOptionGroup } from '$lib/schema/product-options';

export type ProductsState = {
	products: Product[];
	optionGroups: ProductOptionGroup[];
	options: ProductOption[];
	createProduct: (input: Omit<Product, 'id' | 'created_at' | 'updated_at'>) => Product;
	updateProduct: (id: string, input: Partial<Omit<Product, 'id' | 'created_at' | 'updated_at'>>) => void;
	deleteProduct: (id: string) => void;
	createGroup: (input: Omit<ProductOptionGroup, 'id' | 'created_at' | 'updated_at'>) => ProductOptionGroup;
	updateGroup: (
		id: string,
		input: Partial<Omit<ProductOptionGroup, 'id' | 'created_at' | 'updated_at'>>
	) => void;
	deleteGroup: (id: string) => void;
	createOption: (input: Omit<ProductOption, 'id' | 'created_at' | 'updated_at'>) => ProductOption;
	updateOption: (id: string, input: Partial<Omit<ProductOption, 'id' | 'created_at' | 'updated_at'>>) => void;
	deleteOption: (id: string) => void;
	getGroupsByProduct: (productId: string) => ProductOptionGroup[];
	getOptionsByGroup: (groupId: string) => ProductOption[];
	hydrate: () => void;
};

const PRODUCTS_KEY = 'products';
const GROUPS_KEY = 'product_option_groups';
const OPTIONS_KEY = 'product_options';

const load = <T>(key: string, fallback: T): T => {
	if (!browser) return fallback;
	try {
		const raw = localStorage.getItem(`grido_v0_${key}`);
		return raw ? (JSON.parse(raw) as T) : fallback;
	} catch {
		return fallback;
	}
};

const persist = (state: Pick<ProductsState, 'products' | 'optionGroups' | 'options'>) => {
	if (!browser) return;
	localStorage.setItem(`grido_v0_${PRODUCTS_KEY}`, JSON.stringify(state.products));
	localStorage.setItem(`grido_v0_${GROUPS_KEY}`, JSON.stringify(state.optionGroups));
	localStorage.setItem(`grido_v0_${OPTIONS_KEY}`, JSON.stringify(state.options));
};

export const productsStore = createStore<ProductsState>()((set, get) => ({
	products: [],
	optionGroups: [],
	options: [],
	hydrate: () => {
		set({
			products: load<Product[]>(PRODUCTS_KEY, []),
			optionGroups: load<ProductOptionGroup[]>(GROUPS_KEY, []),
			options: load<ProductOption[]>(OPTIONS_KEY, [])
		});
	},
	createProduct: (input) => {
		const now = isoNow();
		const next: Product = { id: generateId('prx'), created_at: now, updated_at: now, ...input };
		set((state) => {
			const newState = { ...state, products: [next, ...state.products] };
			persist(newState);
			return newState;
		});
		return next;
	},
	updateProduct: (id, input) =>
		set((state) => {
			const products = state.products.map((item) =>
				item.id === id ? { ...item, ...input, updated_at: isoNow() } : item
			);
			const newState = { ...state, products };
			persist(newState);
			return newState;
		}),
	deleteProduct: (id) =>
		set((state) => {
			const products = state.products.map((item) =>
				item.id === id ? { ...item, active: false, updated_at: isoNow() } : item
			);
			const newState = { ...state, products };
			persist(newState);
			return newState;
		}),
	createGroup: (input) => {
		const now = isoNow();
		const next: ProductOptionGroup = { id: generateId('grp'), created_at: now, updated_at: now, ...input };
		set((state) => {
			const newState = { ...state, optionGroups: [...state.optionGroups, next] };
			persist(newState);
			return newState;
		});
		return next;
	},
	updateGroup: (id, input) =>
		set((state) => {
			const optionGroups = state.optionGroups.map((item) =>
				item.id === id ? { ...item, ...input, updated_at: isoNow() } : item
			);
			const newState = { ...state, optionGroups };
			persist(newState);
			return newState;
		}),
	deleteGroup: (id) =>
		set((state) => {
			const optionGroups = state.optionGroups.filter((item) => item.id !== id);
			const options = state.options.filter((opt) => opt.group_id !== id);
			const newState = { ...state, optionGroups, options };
			persist(newState);
			return newState;
		}),
	createOption: (input) => {
		const now = isoNow();
		const next: ProductOption = { id: generateId('opt'), created_at: now, updated_at: now, ...input };
		set((state) => {
			const newState = { ...state, options: [...state.options, next] };
			persist(newState);
			return newState;
		});
		return next;
	},
	updateOption: (id, input) =>
		set((state) => {
			const options = state.options.map((item) =>
				item.id === id ? { ...item, ...input, updated_at: isoNow() } : item
			);
			const newState = { ...state, options };
			persist(newState);
			return newState;
		}),
	deleteOption: (id) =>
		set((state) => {
			const options = state.options.filter((item) => item.id !== id);
			const newState = { ...state, options };
			persist(newState);
			return newState;
		}),
	getGroupsByProduct: (productId) =>
		get()
			.optionGroups.filter((group) => group.product_id === productId)
			.sort((a, b) => a.sort_order - b.sort_order),
	getOptionsByGroup: (groupId) =>
		get()
			.options.filter((option) => option.group_id === groupId)
			.sort((a, b) => a.sort_order - b.sort_order)
}));
