<script lang="ts">
	import { Dialog } from 'bits-ui';
	import {
		optionCreateSchema,
		optionGroupCreateSchema,
		productCreateSchema,
		type ProductOptionGroup
	} from '$lib/schema/product-options';
	import { productsStore } from '$lib/stores/productsStore';
	import { fromZustand } from '$lib/stores/zustandBridge';
	import { toastsStore } from '$lib/stores/toasts';
	import { formatMoney } from '$lib/utils';
	import { supabase } from '$lib/supabase/client';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { createTable, getCoreRowModel, getPaginationRowModel, type ColumnDef, type Table } from '@tanstack/table-core';
	import {
		loadProductsTableState,
		saveProductsTableState,
		type ProductsTableSortColumn,
		type ProductsTableSorting
	} from '$lib/components/products/products-table-persistence';
	import ProductsPaginator from '$lib/components/products/ProductsPaginator.svelte';

	type ProductCategoryLink = { category_id: string; categories: { id: string; name: string } | null };
	type SupabaseProduct = {
		id: string;
		name: string;
		description: string;
		price: number;
		active: boolean;
		product_categories?: ProductCategoryLink[];
	};

	const productsState = fromZustand(productsStore);

	let productDialogOpen = $state(false);
	let groupDialogOpen = $state(false);
	let optionDialogOpen = $state(false);
	let detailDrawerOpen = $state(false);
	let deleteConfirmOpen = $state(false);
	let savingProduct = $state(false);

	let supabaseProducts = $state<SupabaseProduct[]>([]);
	// Lista para la tabla (mismo patrón que Categorías: se asigna en load)
	let products = $state<SupabaseProduct[]>([]);
	let productsLoading = $state(true);
	let useSupabase = $state(true);

	let editingProductId = $state<string | null>(null);
	let targetProductId = $state<string | null>(null);
	let targetGroupId = $state<string | null>(null);
	let expandedGroupId = $state<string | null>(null);
	let selectedProductIds = $state<string[]>([]);

	type SortColumn = 'name' | 'category' | 'code' | 'price' | 'state';
	let sortColumn = $state<SortColumn>('name');
	let sortDir = $state<'asc' | 'desc'>('asc');

	// Estado de tabla con persistencia (solo aplicado en cliente en onMount).
	let searchQuery = $state('');
	let pageIndex = $state(0);
	let pageSize = $state(20);
	const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

	function persistProductsTable() {
		if (!browser) return;
		saveProductsTableState({
			pageIndex,
			pageSize,
			search: searchQuery,
			sorting: { column: sortColumn as ProductsTableSortColumn, dir: sortDir }
		});
	}

	type CategoryOption = { id: string; name: string };
	type ProductGroupOption = { id: string; name: string };
	type ProductGroupAssignment = { group_id: string; max_select: number };
	let productForm = $state({
		name: '',
		base_price: 0,
		active: true,
		category_ids: [] as string[],
		groups: [] as ProductGroupAssignment[]
	});
	let categoriesList = $state<CategoryOption[]>([]);
	let productGroupsList = $state<ProductGroupOption[]>([]);
	let groupForm = $state({ name: '', min_select: 0, max_select: 1, sort_order: 0 });
	let optionForm = $state({ name: '', price_delta: 0, active: true, sort_order: 0 });

	const loadCategories = async () => {
		const { data, error } = await supabase
			.from('categories')
			.select('id, name')
			.eq('active', true)
			.order('sort_order', { ascending: true })
			.order('name', { ascending: true });
		if (!error && data) categoriesList = data as CategoryOption[];
	};

	const loadProductGroups = async () => {
		const { data, error } = await supabase
			.from('product_groups')
			.select('id, name')
			.eq('active', true)
			.order('sort_order', { ascending: true })
			.order('name', { ascending: true });
		if (!error && data) productGroupsList = data as ProductGroupOption[];
	};

	const loadProductGroupAssignments = async (productId: string): Promise<ProductGroupAssignment[]> => {
		const { data, error } = await supabase
			.from('product_product_groups')
			.select('group_id, max_select')
			.eq('product_id', productId);
		if (error) return [];
		return (data ?? []).map((r) => ({ group_id: r.group_id, max_select: r.max_select ?? 1 }));
	};

	const loadSupabaseProducts = async () => {
		productsLoading = true;
		const { data, error } = await supabase
			.from('products')
			.select('id, name, description, price, active, product_categories(category_id, categories(id, name))')
			.order('name', { ascending: true });
		if (error) {
			toastsStore.error(error.message || 'Error al cargar productos');
			supabaseProducts = [];
			products = [];
		} else {
			const list = (data ?? []) as unknown as SupabaseProduct[];
			supabaseProducts = list;
			products = list.filter((p) => p.active);
		}
		productsLoading = false;
	};

	const storeProducts = $derived($productsState.products);
	const selectedProduct = $derived(products.find((p) => p.id === targetProductId) ?? null);
	const groups = $derived(targetProductId ? $productsState.getGroupsByProduct(targetProductId) : []);
	const totalProducts = products.length;

	// Búsqueda global por nombre, descripción y categoría(s).
	const filteredProducts = $derived.by(() => {
		const q = String(searchQuery).trim().toLowerCase();
		if (!q) return products;
		return products.filter((p) => {
			const name = (p.name ?? '').toLowerCase();
			const desc = (p.description ?? '').toLowerCase();
			const cat = getProductCategoryNames(p).toLowerCase();
			return name.includes(q) || desc.includes(q) || cat.includes(q);
		});
	});

	const sortedProducts = $derived.by(() => {
		const list = [...filteredProducts];
		const dir = sortDir === 'asc' ? 1 : -1;
		list.sort((a, b) => {
			let va: string | number;
			let vb: string | number;
			switch (sortColumn) {
				case 'name':
					va = a.name ?? '';
					vb = b.name ?? '';
					return dir * String(va).localeCompare(String(vb));
				case 'category': {
					va = getProductCategoryNames(a) || '—';
					vb = getProductCategoryNames(b) || '—';
					return dir * String(va).localeCompare(String(vb));
				}
				case 'code': {
					va = `#P${String(hash(a.id + a.name + 0)).padStart(6, '0')}`;
					vb = `#P${String(hash(b.id + b.name + 0)).padStart(6, '0')}`;
					return dir * String(va).localeCompare(String(vb));
				}
				case 'price':
					va = getProductPrice(a);
					vb = getProductPrice(b);
					return dir * (Number(va) - Number(vb));
				case 'state':
					va = a.active ? 1 : 0;
					vb = b.active ? 1 : 0;
					return dir * (Number(va) - Number(vb));
				default:
					return 0;
			}
		});
		return list;
	});

	const setSort = (col: SortColumn) => {
		if (sortColumn === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		else {
			sortColumn = col;
			sortDir = 'asc';
		}
		pageIndex = 0;
		persistProductsTable();
	};

	const SortIcon = (col: SortColumn) => (sortColumn === col ? (sortDir === 'asc' ? '↑' : '↓') : '↕');

	// TanStack Table solo en cliente (SSR-safe); fuente de verdad para paginación.
	const productColumns = $derived([
		{ id: 'name', accessorKey: 'name', header: 'Nombre' },
		{ id: 'category', accessorFn: (row: SupabaseProduct) => getProductCategoryNames(row), header: 'Categoría' },
		{ id: 'code', accessorFn: (row: SupabaseProduct) => `#P${String(hash(row.id + row.name + 0)).padStart(6, '0')}`, header: 'Código' },
		{ id: 'price', accessorFn: (row: SupabaseProduct) => getProductPrice(row), header: 'Precio' },
		{ id: 'state', accessorFn: (row: SupabaseProduct) => (row.active ? 'Activo' : 'Inactivo'), header: 'Estado' }
	] as ColumnDef<SupabaseProduct, unknown>[]);

	const tableState = $derived({ pagination: { pageIndex, pageSize } });
	const onStateChange = (updater: unknown) => {
		const next = typeof updater === 'function' ? (updater as (prev: { pagination: { pageIndex: number; pageSize: number } }) => typeof tableState)(tableState) : updater;
		const pag = (next as { pagination?: { pageIndex: number; pageSize: number } })?.pagination;
		if (pag) {
			pageIndex = pag.pageIndex;
			pageSize = pag.pageSize;
			persistProductsTable();
		}
	};

	const table = $derived.by((): Table<SupabaseProduct> | null => {
		if (!browser) return null;
		return createTable({
			data: sortedProducts,
			columns: productColumns,
			getRowId: (row) => row.id,
			getCoreRowModel: getCoreRowModel(),
			getPaginationRowModel: getPaginationRowModel(),
			onPaginationChange: (updater) => {
				const next = typeof updater === 'function' ? updater({ pageIndex, pageSize }) : updater;
				pageIndex = next.pageIndex;
				pageSize = next.pageSize;
				persistProductsTable();
			},
			onStateChange: onStateChange as (updater: unknown) => void,
			state: { pagination: tableState.pagination },
			renderFallbackValue: ''
		}) as Table<SupabaseProduct>;
	});

	const paginatedRows = $derived(table?.getRowModel().rows ?? []);
	const tablePageCount = $derived(table?.getPageCount() ?? 1);
	const totalFiltered = $derived(sortedProducts.length);

	// Ajustar pageIndex si nos quedamos sin páginas (p. ej. tras filtrar).
	$effect(() => {
		const count = tablePageCount;
		if (count > 0 && pageIndex >= count) {
			pageIndex = Math.max(0, count - 1);
			persistProductsTable();
		}
	});

	function setPageIndex(idx: number) {
		pageIndex = Math.max(0, Math.min(idx, Math.max(0, tablePageCount - 1)));
		persistProductsTable();
	}
	function setPageSize(size: number) {
		pageSize = size;
		pageIndex = 0;
		persistProductsTable();
	}

	const totalRevenue = $derived(products.reduce((acc, p) => acc + getProductPrice(p), 0));
	const totalSold = $derived(useSupabase ? 0 : storeProducts.reduce((acc, p, i) => acc + buildMeta(p as unknown as (typeof products)[number], i).sales, 0));
	const allSelected = $derived(totalProducts > 0 && selectedProductIds.length === totalProducts);

	const getProductCategoryIds = (p: SupabaseProduct): string[] =>
		(p.product_categories ?? [])
			.map((pc) => pc.categories?.id ?? pc.category_id)
			.filter(Boolean);

	const getProductCategoryNames = (p: SupabaseProduct): string =>
		(p.product_categories ?? [])
			.map((pc) => pc.categories?.name)
			.filter(Boolean)
			.join(', ') || '—';

	const getProductCategoryNamesArray = (p: SupabaseProduct): string[] =>
		(p.product_categories ?? []).map((pc) => pc.categories?.name).filter(Boolean) as string[];

	const openNewProduct = () => {
		targetProductId = null;
		editingProductId = null;
		productForm = { name: '', base_price: 0, active: true, category_ids: [], groups: [] };
		detailDrawerOpen = true;
	};

	const openEditProduct = (id: string) => {
		const product = products.find((p) => p.id === id);
		if (!product) return;
		targetProductId = id;
		editingProductId = id;
		const categoryIds = 'product_categories' in product ? getProductCategoryIds(product as SupabaseProduct) : [];
		productForm = { name: product.name, base_price: getProductPrice(product) as number, active: product.active, category_ids: categoryIds, groups: productForm.groups };
		// Abrir el drawer en el siguiente ciclo para que bits-ui reciba el cambio
		setTimeout(() => {
			detailDrawerOpen = true;
		}, 0);
	};

	const saveProduct = async () => {
		const parsed = productCreateSchema.safeParse(productForm);
		if (!parsed.success) {
			toastsStore.error(parsed.error.issues[0]?.message ?? 'Datos inválidos');
			return;
		}
		savingProduct = true;
		const isSupabaseProduct = editingProductId && supabaseProducts.some((p) => p.id === editingProductId);
		if (editingProductId) {
			if (isSupabaseProduct) {
				const { error } = await supabase
					.from('products')
					.update({
						name: parsed.data.name,
						description: parsed.data.name,
						price: parsed.data.base_price,
						active: parsed.data.active,
						updated_at: new Date().toISOString()
					})
					.eq('id', editingProductId);
				if (error) {
					toastsStore.error(error.message || 'Error al actualizar');
					savingProduct = false;
					return;
				}
				await supabase.from('product_categories').delete().eq('product_id', editingProductId);
				if (productForm.category_ids.length > 0) {
					await supabase.from('product_categories').insert(
						productForm.category_ids.map((category_id) => ({ product_id: editingProductId, category_id }))
					);
				}
				await supabase.from('product_product_groups').delete().eq('product_id', editingProductId);
				if (productForm.groups.length > 0) {
					await supabase.from('product_product_groups').insert(
						productForm.groups.map((g) => ({ product_id: editingProductId, group_id: g.group_id, max_select: g.max_select }))
					);
				}
				toastsStore.success('Producto actualizado');
				await loadSupabaseProducts();
			} else {
				productsStore.getState().updateProduct(editingProductId, parsed.data);
				toastsStore.success('Producto actualizado');
			}
		} else {
			// New product
			if (useSupabase && supabaseProducts.length > 0) {
				const { data: inserted, error } = await supabase
					.from('products')
					.insert({
						name: parsed.data.name,
						description: parsed.data.name,
						price: parsed.data.base_price,
						active: parsed.data.active
					})
					.select('id')
					.single();
				if (error) {
					toastsStore.error(error.message || 'Error al crear producto');
					savingProduct = false;
					return;
				}
				const newId = inserted?.id;
				if (newId && productForm.category_ids.length > 0) {
					await supabase.from('product_categories').insert(
						productForm.category_ids.map((category_id) => ({ product_id: newId, category_id }))
					);
				}
				if (newId && productForm.groups.length > 0) {
					await supabase.from('product_product_groups').insert(
						productForm.groups.map((g) => ({ product_id: newId, group_id: g.group_id, max_select: g.max_select }))
					);
				}
				toastsStore.success('Producto creado');
				await loadSupabaseProducts();
			} else {
				const created = productsStore.getState().createProduct(parsed.data);
				targetProductId = created.id;
				toastsStore.success('Producto creado');
			}
		}
		savingProduct = false;
		detailDrawerOpen = false;
		productDialogOpen = false;
	};

	const removeProduct = async (id: string) => {
		if (!confirm('¿Eliminar producto? (soft delete)')) return;
		const isSupabaseProduct = supabaseProducts.some((p) => p.id === id);
		if (isSupabaseProduct) {
			const { error } = await supabase.from('products').update({ active: false, updated_at: new Date().toISOString() }).eq('id', id);
			if (error) {
				toastsStore.error(error.message || 'Error al desactivar');
				return;
			}
			toastsStore.success('Producto desactivado');
			if (targetProductId === id) targetProductId = null;
			await loadSupabaseProducts();
		} else {
			productsStore.getState().deleteProduct(id);
			if (targetProductId === id) targetProductId = null;
			toastsStore.success('Producto desactivado');
		}
	};

	const openGroupDialog = (productId: string) => {
		targetProductId = productId;
		groupForm = { name: '', min_select: 0, max_select: 1, sort_order: groups.length + 1 };
		groupDialogOpen = true;
	};

	const saveGroup = () => {
		if (!targetProductId) return;
		const parsed = optionGroupCreateSchema.safeParse({
			...groupForm,
			product_id: targetProductId
		});
		if (!parsed.success) {
			toastsStore.error(parsed.error.issues[0]?.message ?? 'Datos inválidos');
			return;
		}
		productsStore.getState().createGroup(parsed.data);
		groupDialogOpen = false;
		toastsStore.success('Grupo creado');
	};

	const deleteGroup = (group: ProductOptionGroup) => {
		if (!confirm(`¿Eliminar grupo "${group.name}" y todas sus opciones?`)) return;
		productsStore.getState().deleteGroup(group.id);
		if (expandedGroupId === group.id) expandedGroupId = null;
		toastsStore.success('Grupo eliminado');
	};

	const openOptionDialog = (groupId: string) => {
		targetGroupId = groupId;
		optionForm = { name: '', price_delta: 0, active: true, sort_order: 0 };
		optionDialogOpen = true;
	};

	const saveOption = () => {
		if (!targetGroupId) return;
		const parsed = optionCreateSchema.safeParse({
			...optionForm,
			group_id: targetGroupId
		});
		if (!parsed.success) {
			toastsStore.error(parsed.error.issues[0]?.message ?? 'Datos inválidos');
			return;
		}
		productsStore.getState().createOption(parsed.data);
		optionDialogOpen = false;
		toastsStore.success('Opción creada');
	};

	const deleteOption = (optionId: string) => {
		if (!confirm('¿Eliminar opción?')) return;
		productsStore.getState().deleteOption(optionId);
		toastsStore.success('Opción eliminada');
	};

	const optionsByGroup = (groupId: string) => $productsState.getOptionsByGroup(groupId);

	const hash = (text: string) =>
		text.split('').reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) % 100000, 7);

	const getProductPrice = (p: (typeof products)[number]): number =>
		'base_price' in p ? (p as { base_price: number }).base_price : (p as SupabaseProduct).price;

	const buildMeta = (product: (typeof products)[number], index: number) => {
		const price: number = getProductPrice(product);
		const h = hash(product.id + product.name + index);
		const sales = (h % 220) + 20;
		const stock = h % 1400;
		const revenue = Number((price * sales).toFixed(2));
		const rating = 4 + ((h % 10) / 10 > 0.7 ? 1 : 0);
		const status = stock < 80 ? 'Out of Stock' : stock < 300 ? 'Restock' : 'In Stock';
		return {
			code: `#P${String(h).padStart(6, '0')}`,
			revenue,
			sales,
			stock,
			rating,
			status
		};
	};

	const toggleProductSelection = (id: string) => {
		selectedProductIds = selectedProductIds.includes(id)
			? selectedProductIds.filter((item) => item !== id)
			: [...selectedProductIds, id];
	};

	const toggleAllSelection = () => {
		selectedProductIds = allSelected ? [] : products.map((p) => p.id);
	};

	onMount(() => {
		productsStore.getState().hydrate();
		void loadCategories();
		void loadProductGroups();
		void loadSupabaseProducts();
		// Restaurar estado persistido de la tabla (solo en browser).
		if (browser) {
			const saved = loadProductsTableState();
			if (saved.search !== undefined) searchQuery = saved.search;
			if (saved.sorting) {
				sortColumn = saved.sorting.column;
				sortDir = saved.sorting.dir;
			}
			if (saved.pageIndex !== undefined) pageIndex = Math.max(0, saved.pageIndex);
			if (saved.pageSize !== undefined && PAGE_SIZE_OPTIONS.includes(saved.pageSize)) pageSize = saved.pageSize;
		}
	});

	$effect(() => {
		if (selectedProduct && detailDrawerOpen) {
			const categoryIds = 'product_categories' in selectedProduct ? getProductCategoryIds(selectedProduct as SupabaseProduct) : [];
			productForm = {
				name: selectedProduct.name,
				base_price: getProductPrice(selectedProduct),
				active: selectedProduct.active,
				category_ids: categoryIds,
				groups: []
			};
			if (useSupabase && supabaseProducts.length > 0) {
				loadProductGroupAssignments(selectedProduct.id).then((groups) => {
					productForm = { ...productForm, groups };
				});
			}
		}
	});

	const toggleCategory = (categoryId: string) => {
		const idx = productForm.category_ids.indexOf(categoryId);
		if (idx === -1) productForm.category_ids = [...productForm.category_ids, categoryId];
		else productForm.category_ids = productForm.category_ids.filter((id) => id !== categoryId);
	};

	const toggleGroup = (groupId: string) => {
		const idx = productForm.groups.findIndex((g) => g.group_id === groupId);
		if (idx === -1) productForm.groups = [...productForm.groups, { group_id: groupId, max_select: 1 }];
		else productForm.groups = productForm.groups.filter((g) => g.group_id !== groupId);
	};

	const setGroupMax = (groupId: string, max_select: number) => {
		const v = Math.max(1, Math.min(99, max_select));
		productForm.groups = productForm.groups.map((g) => (g.group_id === groupId ? { ...g, max_select: v } : g));
	};

	const getGroupMax = (groupId: string) =>
		productForm.groups.find((g) => g.group_id === groupId)?.max_select ?? 1;

	const isGroupSelected = (groupId: string) => productForm.groups.some((g) => g.group_id === groupId);
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<button class="btn-primary" onclick={openNewProduct}>+ Add New Product</button>
		<div class="flex items-center gap-2">
			<button class="btn-secondary !px-2 !py-1" title="Filter">⚙</button>
			<button class="btn-secondary !px-2 !py-1" title="Sort">⇅</button>
			<button class="btn-secondary !px-2 !py-1" title="Columns">☰</button>
			<button class="btn-secondary">Statistic</button>
			<button class="btn-secondary">Export</button>
		</div>
	</div>

	<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
		<div class="panel p-4">
			<p class="text-sm text-slate-500 dark:text-slate-400">Total Product</p>
			<p class="mt-1 text-4xl font-semibold">{totalProducts}</p>
		</div>
		<div class="panel p-4">
			<p class="text-sm text-slate-500 dark:text-slate-400">Product Revenue</p>
			<p class="mt-1 text-4xl font-semibold">{formatMoney(totalRevenue)}</p>
		</div>
		<div class="panel p-4">
			<p class="text-sm text-slate-500 dark:text-slate-400">Product Sold</p>
			<p class="mt-1 text-4xl font-semibold">{totalSold}</p>
		</div>
	</div>

	<section class="panel p-4">
		{#if productsLoading}
			<p class="py-8 text-center text-sm text-slate-500 dark:text-slate-400">Cargando…</p>
		{:else if products.length === 0}
			<p class="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
				No hay productos. Creá uno con «+ Add New Product».
			</p>
		{:else}
			<!-- Búsqueda global: nombre, descripción, categoría. Al cambiar, resetear página. -->
			{#if browser}
				<div class="mb-4">
					<label for="products-search" class="block text-sm font-medium text-slate-700 dark:text-slate-300">Buscar</label>
					<input
						id="products-search"
						type="search"
						class="input mt-1 max-w-md"
						placeholder="Nombre, descripción o categoría…"
						aria-label="Buscar productos"
						value={searchQuery}
						oninput={(e) => {
							searchQuery = (e.currentTarget as HTMLInputElement).value;
							pageIndex = 0;
							persistProductsTable();
						}}
					/>
				</div>
			{/if}

			{#if !browser}
				<div class="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
					Cargando tabla…
				</div>
			{:else if !table}
				<div class="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
					Cargando tabla…
				</div>
			{:else}
				<div class="overflow-auto">
					<table class="min-w-full text-sm">
						<thead class="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800">
							<tr>
								<th class="px-3 py-2 text-left">
									<button
										type="button"
										class="flex items-center gap-1 font-medium hover:text-slate-700 dark:hover:text-slate-200"
										onclick={() => setSort('name')}
									>
										Nombre {SortIcon('name')}
									</button>
								</th>
								<th class="px-3 py-2 text-left">
									<button
										type="button"
										class="flex items-center gap-1 font-medium hover:text-slate-700 dark:hover:text-slate-200"
										onclick={() => setSort('category')}
									>
										Categoría {SortIcon('category')}
									</button>
								</th>
								<th class="px-3 py-2 text-left">
									<button
										type="button"
										class="flex items-center gap-1 font-medium hover:text-slate-700 dark:hover:text-slate-200"
										onclick={() => setSort('code')}
									>
										Código {SortIcon('code')}
									</button>
								</th>
								<th class="px-3 py-2 text-left">
									<button
										type="button"
										class="flex items-center gap-1 font-medium hover:text-slate-700 dark:hover:text-slate-200"
										onclick={() => setSort('price')}
									>
										Precio {SortIcon('price')}
									</button>
								</th>
								<th class="px-3 py-2 text-right">
									<button
										type="button"
										class="ml-auto flex items-center gap-1 font-medium hover:text-slate-700 dark:hover:text-slate-200"
										onclick={() => setSort('state')}
									>
										Estado {SortIcon('state')}
									</button>
								</th>
								<th class="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Acciones</th>
							</tr>
						</thead>
						<tbody>
							{#each paginatedRows as row}
								{@const product = row.original}
								{@const meta = buildMeta(product, row.index)}
								<tr class="border-t border-slate-100 transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/40">
									<td class="px-3 py-2">
										<button
											type="button"
											class="cursor-pointer text-left font-medium text-slate-900 underline-offset-2 hover:underline hover:text-slate-700 dark:text-slate-100 dark:hover:text-slate-300"
											title="Clic para editar"
											onclick={() => openEditProduct(product.id)}
										>
											{product.name}
										</button>
									</td>
									<td class="px-3 py-2">
										{#if useSupabase && supabaseProducts.length > 0}
											{@const catNames = getProductCategoryNamesArray(product)}
											{#if catNames.length > 0}
												<div class="flex flex-wrap gap-1">
													{#each catNames as name}
														<span
															class="inline-flex rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-600 dark:text-slate-200"
														>
															{name}
														</span>
													{/each}
												</div>
											{:else}
												<span class="text-slate-400">—</span>
											{/if}
										{:else}
											<span class="text-slate-400">—</span>
										{/if}
									</td>
									<td class="px-3 py-2">{meta.code}</td>
									<td class="px-3 py-2">{formatMoney(getProductPrice(product))}</td>
									<td class="px-3 py-2 text-right">
										<span
											class="inline-flex rounded-full px-2 py-1 text-xs font-medium"
											class:bg-emerald-100={product.active}
											class:text-emerald-700={product.active}
											class:bg-slate-200={!product.active}
											class:text-slate-600={!product.active}
											class:dark:bg-emerald-900={product.active}
											class:dark:text-emerald-200={product.active}
											class:dark:bg-slate-700={!product.active}
											class:dark:text-slate-400={!product.active}
										>
											{product.active ? 'Activo' : 'Inactivo'}
										</span>
									</td>
									<td class="px-3 py-2">
										<button class="btn-secondary !px-2 !py-1 text-xs" onclick={() => openEditProduct(product.id)}>Editar</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<!-- Paginador Melt UI: Primero | Anterior | números | Siguiente | Último + tamaño de página -->
				<div class="mt-4">
					<ProductsPaginator
						totalRows={totalFiltered}
						pageSize={pageSize}
						pageIndex={pageIndex}
						pageCount={tablePageCount}
						pageSizeOptions={PAGE_SIZE_OPTIONS}
						onPageIndexChange={setPageIndex}
						onPageSizeChange={setPageSize}
					/>
				</div>
			{/if}
		{/if}
	</section>
</div>

<Dialog.Root bind:open={detailDrawerOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-black/30" />
		<Dialog.Content
			class="fixed right-0 top-0 z-50 flex h-screen w-[500px] max-w-[95vw] flex-col border-l border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
		>
			<div class="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
				<h2 class="text-lg font-semibold">{selectedProduct ? 'Editar producto' : 'Nuevo producto'}</h2>
				<Dialog.Close
					class="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300"
					aria-label="Cerrar"
				>
					<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M18 6L6 18M6 6l12 12" />
					</svg>
				</Dialog.Close>
			</div>

			<div class="min-h-0 flex-1 overflow-y-auto p-4">
			{#if selectedProduct || (editingProductId === null && targetProductId === null)}
				<div class="space-y-3">
					<label class="block space-y-1">
						<span class="text-sm font-medium">Nombre</span>
						<input class="input" bind:value={productForm.name} />
					</label>
					{#if useSupabase && supabaseProducts.length > 0 && categoriesList.length > 0}
						<div class="block space-y-2">
							<span class="text-sm font-medium">Categorías</span>
							<div class="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-700">
								{#each categoriesList as cat}
									<label class="flex cursor-pointer items-center gap-2 text-sm">
										<input
											type="checkbox"
											checked={productForm.category_ids.includes(cat.id)}
											onchange={() => toggleCategory(cat.id)}
										/>
										{cat.name}
									</label>
								{/each}
							</div>
						</div>
					{/if}
					<label class="block space-y-1">
						<span class="text-sm font-medium">Precio base</span>
						<input class="input" type="number" min="0" bind:value={productForm.base_price} />
					</label>
					<label class="flex items-center gap-2 text-sm">
						<input type="checkbox" bind:checked={productForm.active} />
						Activo
					</label>
				</div>

				<div class="mt-6 border-t border-slate-200 pt-4 dark:border-slate-700">
					<div class="mb-3">
						<h3 class="text-base font-semibold">Grupos de opciones</h3>
						<p class="text-xs text-slate-500 dark:text-slate-400">
							{#if useSupabase && supabaseProducts.length > 0}
								Asigná los grupos (ej. Sabores) y el número máximo de ítems que el cliente puede elegir (ej. máx. 2 sabores).
							{:else if selectedProduct}
								Producto: {selectedProduct.name}
							{:else}
								Nuevo producto
							{/if}
						</p>
					</div>

					{#if useSupabase && supabaseProducts.length > 0}
						{#if productGroupsList.length === 0}
							<div class="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
								No hay grupos definidos. Creálos en la sección <strong>Grupos</strong> del menú.
							</div>
						{:else}
							<div class="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-700">
								{#each productGroupsList as grp}
									<div class="flex items-center gap-2 text-sm">
										<label class="flex cursor-pointer flex-1 items-center gap-2">
											<input
												type="checkbox"
												checked={isGroupSelected(grp.id)}
												onchange={() => toggleGroup(grp.id)}
											/>
											{grp.name}
										</label>
										{#if isGroupSelected(grp.id)}
											<label class="flex shrink-0 items-center gap-1.5 text-xs" title="Máximo de ítems que el cliente puede elegir (ej. sabores)">
												<span class="whitespace-nowrap text-slate-500 dark:text-slate-400">Máx. a elegir:</span>
												<input
													type="number"
													min="1"
													max="99"
													class="input w-10 min-w-0 !py-1 text-center text-sm"
													value={getGroupMax(grp.id)}
													oninput={(e) => setGroupMax(grp.id, parseInt(e.currentTarget.value, 10) || 1)}
												/>
											</label>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
					{:else}
						{#if groups.length === 0}
							<div class="rounded-lg border border-dashed border-slate-300 p-4 text-sm dark:border-slate-700">
								Aún no hay grupos (solo para productos del almacén local).
							</div>
						{:else}
							<div class="space-y-3">
								{#each groups as group}
									<div class="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
										<div class="flex items-center justify-between">
											<div>
												<p class="text-sm font-semibold">{group.name}</p>
												<p class="text-xs text-slate-500 dark:text-slate-400">
													min {group.min_select} / max {group.max_select}
												</p>
											</div>
											<div class="flex gap-2">
												<button
													class="btn-secondary !px-2 !py-1 text-xs"
													onclick={() => (expandedGroupId = expandedGroupId === group.id ? null : group.id)}
												>
													{expandedGroupId === group.id ? 'Ocultar' : 'Ver opciones'}
												</button>
												<button class="btn-danger !px-2 !py-1 text-xs" onclick={() => deleteGroup(group)}>Eliminar</button>
											</div>
										</div>
										{#if expandedGroupId === group.id}
											<div class="mt-3 space-y-2 border-t border-slate-200 pt-3 dark:border-slate-700">
												<div class="flex items-center justify-between">
													<p class="text-xs font-medium text-slate-600 dark:text-slate-300">Opciones</p>
													<button class="btn-secondary !px-2 !py-1 text-xs" onclick={() => openOptionDialog(group.id)}>
														Nueva opción
													</button>
												</div>
												{#each optionsByGroup(group.id) as option}
													<div class="flex items-center justify-between rounded border border-slate-200 px-2 py-1 text-sm dark:border-slate-700">
														<div>
															<p class="font-medium">{option.name}</p>
															<p class="text-xs text-slate-500 dark:text-slate-400">
																Delta: {formatMoney(option.price_delta)} - {option.active ? 'Activa' : 'Inactiva'}
															</p>
														</div>
														<button class="btn-danger !px-2 !py-1 text-xs" onclick={() => deleteOption(option.id)}>
															Eliminar
														</button>
													</div>
												{/each}
											</div>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
					{/if}
				</div>
			{/if}
			</div>

			{#if selectedProduct || (editingProductId === null && targetProductId === null)}
				<div class="flex shrink-0 justify-between gap-3 border-t border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
					{#if selectedProduct}
						<button
							class="btn-danger"
							onclick={() => (deleteConfirmOpen = true)}
						>
							Eliminar
						</button>
					{:else}
						<div></div>
					{/if}
					<button class="btn-primary" onclick={() => void saveProduct()} disabled={savingProduct}>
						{savingProduct ? 'Guardando…' : 'Guardar producto'}
					</button>
				</div>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<Dialog.Root bind:open={deleteConfirmOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-50 bg-black/40" />
		<Dialog.Content class="fixed left-1/2 top-1/2 z-[60] w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
			<p class="mb-4 text-sm text-slate-600 dark:text-slate-300">
				¿Está seguro que desea eliminar este producto?
			</p>
			<div class="flex justify-end gap-2">
				<Dialog.Close class="btn-secondary">Cancelar</Dialog.Close>
				<button
					class="btn-danger"
					onclick={async () => {
						if (selectedProduct) {
							await removeProduct(selectedProduct.id);
							deleteConfirmOpen = false;
							detailDrawerOpen = false;
						}
					}}
				>
					Eliminar
				</button>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<Dialog.Root bind:open={productDialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-black/40" />
		<Dialog.Content class="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-4 dark:bg-slate-900">
			<h3 class="mb-3 text-lg font-semibold">{editingProductId ? 'Editar producto' : 'Nuevo producto'}</h3>
			<div class="space-y-3">
				<label class="block space-y-1">
					<span class="text-sm font-medium">Nombre</span>
					<input class="input" bind:value={productForm.name} />
				</label>
				<label class="block space-y-1">
					<span class="text-sm font-medium">Precio base</span>
					<input class="input" type="number" min="0" bind:value={productForm.base_price} />
				</label>
				<label class="flex items-center gap-2 text-sm">
					<input type="checkbox" bind:checked={productForm.active} />
					Activo
				</label>
				<div class="flex justify-end gap-2">
					<Dialog.Close class="btn-secondary">Cancelar</Dialog.Close>
					<button class="btn-primary" onclick={saveProduct}>Guardar</button>
				</div>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<Dialog.Root bind:open={groupDialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-black/40" />
		<Dialog.Content class="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-4 dark:bg-slate-900">
			<h3 class="mb-3 text-lg font-semibold">Nuevo grupo</h3>
			<div class="space-y-3">
				<label class="block space-y-1">
					<span class="text-sm font-medium">Nombre</span>
					<input class="input" bind:value={groupForm.name} />
				</label>
				<div class="grid grid-cols-3 gap-2">
					<label class="block space-y-1">
						<span class="text-xs font-medium">Min</span>
						<input class="input" type="number" min="0" bind:value={groupForm.min_select} />
					</label>
					<label class="block space-y-1">
						<span class="text-xs font-medium">Max</span>
						<input class="input" type="number" min="1" bind:value={groupForm.max_select} />
					</label>
					<label class="block space-y-1">
						<span class="text-xs font-medium">Orden</span>
						<input class="input" type="number" min="0" bind:value={groupForm.sort_order} />
					</label>
				</div>
				<div class="flex justify-end gap-2">
					<Dialog.Close class="btn-secondary">Cancelar</Dialog.Close>
					<button class="btn-primary" onclick={saveGroup}>Guardar</button>
				</div>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<Dialog.Root bind:open={optionDialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-black/40" />
		<Dialog.Content class="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-4 dark:bg-slate-900">
			<h3 class="mb-3 text-lg font-semibold">Nueva opción</h3>
			<div class="space-y-3">
				<label class="block space-y-1">
					<span class="text-sm font-medium">Nombre</span>
					<input class="input" bind:value={optionForm.name} />
				</label>
				<div class="grid grid-cols-3 gap-2">
					<label class="block space-y-1">
						<span class="text-xs font-medium">Delta precio</span>
						<input class="input" type="number" bind:value={optionForm.price_delta} />
					</label>
					<label class="block space-y-1">
						<span class="text-xs font-medium">Orden</span>
						<input class="input" type="number" min="0" bind:value={optionForm.sort_order} />
					</label>
					<label class="flex items-center gap-2 pt-6 text-sm">
						<input type="checkbox" bind:checked={optionForm.active} />
						Activa
					</label>
				</div>
				<div class="flex justify-end gap-2">
					<Dialog.Close class="btn-secondary">Cancelar</Dialog.Close>
					<button class="btn-primary" onclick={saveOption}>Guardar</button>
				</div>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
