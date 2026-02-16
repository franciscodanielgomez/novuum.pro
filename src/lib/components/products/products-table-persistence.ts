/**
 * Persistencia de la tabla de Productos en localStorage.
 * Solo usar en cliente (browser); no acceder en SSR.
 */

const KEY_PAGE_INDEX = 'products_table_pageIndex';
const KEY_PAGE_SIZE = 'products_table_pageSize';
const KEY_SEARCH = 'products_table_search';
const KEY_SORTING = 'products_table_sorting';

export type ProductsTableSortColumn = 'name' | 'category' | 'code' | 'price' | 'state';
export type ProductsTableSorting = { column: ProductsTableSortColumn; dir: 'asc' | 'desc' };

export interface ProductsTablePersistedState {
	pageIndex: number;
	pageSize: number;
	search: string;
	sorting: ProductsTableSorting;
}

function safeGet<T>(key: string, parse: (raw: string) => T, fallback: T): T {
	if (typeof window === 'undefined') return fallback;
	try {
		const raw = localStorage.getItem(key);
		if (raw == null) return fallback;
		return parse(raw);
	} catch {
		return fallback;
	}
}

function safeSet(key: string, value: string): void {
	if (typeof window === 'undefined') return;
	try {
		localStorage.setItem(key, value);
	} catch {
		// ignore quota
	}
}

/** Cargar estado persistido (solo en browser). */
export function loadProductsTableState(): Partial<ProductsTablePersistedState> {
	return {
		pageIndex: safeGet(KEY_PAGE_INDEX, (r) => Math.max(0, parseInt(r, 10)), 0),
		pageSize: safeGet(KEY_PAGE_SIZE, (r) => {
			const n = parseInt(r, 10);
			return [10, 20, 50, 100].includes(n) ? n : 20;
		}, 20),
		search: safeGet(KEY_SEARCH, (r) => r ?? '', ''),
		sorting: safeGet(KEY_SORTING, (r) => {
			try {
				const o = JSON.parse(r) as { column?: string; dir?: string };
				const col = o?.column as ProductsTableSortColumn | undefined;
				const dir = o?.dir === 'desc' ? 'desc' : 'asc';
				if (col && ['name', 'category', 'code', 'price', 'state'].includes(col)) {
					return { column: col, dir };
				}
			} catch {
				// ignore
			}
			return { column: 'name' as ProductsTableSortColumn, dir: 'asc' as const };
		}, { column: 'name', dir: 'asc' })
	};
}

/** Guardar estado (solo en browser). */
export function saveProductsTableState(state: Partial<ProductsTablePersistedState>): void {
	if (state.pageIndex !== undefined) safeSet(KEY_PAGE_INDEX, String(state.pageIndex));
	if (state.pageSize !== undefined) safeSet(KEY_PAGE_SIZE, String(state.pageSize));
	if (state.search !== undefined) safeSet(KEY_SEARCH, state.search);
	if (state.sorting !== undefined) safeSet(KEY_SORTING, JSON.stringify(state.sorting));
}
