<script lang="ts">
	import { Dialog } from 'bits-ui';
	import {
		optionCreateSchema,
		optionGroupCreateSchema,
		productCreateSchema,
		type ProductOptionGroup
	} from '$lib/schema/product-options';
	import { api } from '$lib/api';
	import { asyncGuard } from '$lib/data/asyncGuard';
	import { productsStore } from '$lib/stores/productsStore';
	import { refreshTrigger } from '$lib/stores/refreshTrigger';
	import { fromZustand } from '$lib/stores/zustandBridge';
	import { toastsStore } from '$lib/stores/toasts';
	import { posDataCache } from '$lib/pos/cache';
	import { clearPosSelfHealMark, tryPosSelfHealReload } from '$lib/pos/self-heal';
	import { formatMoney } from '$lib/utils';
	import { supabase } from '$lib/supabase/client';
	import { removeStorageFileIfOurs } from '$lib/supabase/storage-helpers';
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

	type ProductCategoryLink = {
		category_id: string;
		categories: { id: string; name: string } | Array<{ id: string; name: string }> | null;
	};
	type SupabaseProduct = {
		id: string;
		name: string;
		description: string;
		price: number;
		active: boolean;
		image_url?: string | null;
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
	let productsLoadError = $state<string | null>(null);
	let useSupabase = $state(true);
	let productsLoadInFlight: Promise<void> | null = null;
	let productsRetryTimeoutId: ReturnType<typeof setTimeout> | null = null;
	let productsLoadStartedAt = 0;
	let drawerLoadController: AbortController | null = null;

	let editingProductId = $state<string | null>(null);
	let targetProductId = $state<string | null>(null);
	let targetGroupId = $state<string | null>(null);
	let expandedGroupId = $state<string | null>(null);
	let selectedProductIds = $state<string[]>([]);
	/** Producto a eliminar desde la fila de la tabla (sin abrir el drawer) */
	let productToDeleteId = $state<string | null>(null);
	/** Error al cargar asignaciones de grupos en el drawer (para mostrar Reintentar) */
	let groupsAssignmentsLoadError = $state(false);

	type SortColumn = 'name' | 'category' | 'code' | 'price' | 'state';
	let sortColumn = $state<SortColumn>('name');
	let sortDir = $state<'asc' | 'desc'>('asc');

	// Estado de tabla con persistencia (solo aplicado en cliente en onMount).
	let searchQuery = $state('');
	let categoryFilterId = $state('');
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
	const PRODUCTS_CACHE_KEY = 'products';
	const PRODUCTS_RETRY_MS = 15_000;
	const PRODUCTS_STUCK_RELOAD_MS = 20_000;
	const PRODUCTS_SELFHEAL_SCREEN_KEY = 'products';
	const PRODUCT_IMAGES_BUCKET = 'novum-grido';
	let productForm = $state({
		name: '',
		base_price: 0,
		active: true,
		image_url: '',
		category_ids: [] as string[],
		groups: [] as ProductGroupAssignment[]
	});
	let productImageUploading = $state(false);
	let showImageUrlInput = $state(false);
	let imageUrlInputValue = $state('');
	let categoriesList = $state<CategoryOption[]>([]);
	let productGroupsList = $state<ProductGroupOption[]>([]);
	let groupForm = $state({ name: '', min_select: 0, max_select: 1, sort_order: 0 });
	let optionForm = $state({ name: '', price_delta: 0, active: true, sort_order: 0 });
	const isTimeoutError = (e: unknown): boolean =>
		(e instanceof Error && e.name === 'AbortError') ||
		(typeof e === 'object' &&
			e !== null &&
			'name' in e &&
			(e as { name?: string }).name === 'AppError' &&
			'kind' in e &&
			(e as { kind?: string }).kind === 'timeout');

	const loadCategories = async () => {
		const data = await api.products.listCategories();
		categoriesList = (data ?? []) as CategoryOption[];
	};

	const loadProductGroups = async () => {
		const data = await api.products.listGroups();
		productGroupsList = (data ?? []) as ProductGroupOption[];
	};

	const loadProductGroupAssignments = async (
		productId: string,
		signal?: AbortSignal
	): Promise<ProductGroupAssignment[]> => {
		const data = await api.products.listAssignments(productId, signal);
		return (data ?? []).map((r) => ({ group_id: r.group_id, max_select: r.max_select ?? 1 }));
	};

	const fetchProductsFromSupabase = async (): Promise<SupabaseProduct[]> => {
		const data = await api.products.list();
		return (data ?? []) as unknown as SupabaseProduct[];
	};
	const clearProductsRetry = () => {
		if (productsRetryTimeoutId) {
			clearTimeout(productsRetryTimeoutId);
			productsRetryTimeoutId = null;
		}
	};
	const scheduleProductsRetry = () => {
		if (productsRetryTimeoutId) return;
		productsRetryTimeoutId = setTimeout(() => {
			productsRetryTimeoutId = null;
			void loadSupabaseProducts();
		}, PRODUCTS_RETRY_MS);
	};
	const loadSupabaseProducts = async () => {
		if (productsLoadInFlight) return productsLoadInFlight;
		productsLoadInFlight = (async () => {
		productsLoading = true;
		productsLoadStartedAt = Date.now();
		productsLoadError = null;
		try {
			const list = await fetchProductsFromSupabase();
			supabaseProducts = list;
			products = list.filter((p) => p.active);
			posDataCache.set(PRODUCTS_CACHE_KEY, list);
			clearPosSelfHealMark(PRODUCTS_SELFHEAL_SCREEN_KEY);
			clearProductsRetry();
		} catch (e2) {
			const isTimeout = (e2 as Error)?.name === 'AbortError';
			const msg =
				isTimeout
					? 'La carga de productos superó el tiempo de espera'
					: e2 instanceof Error
						? e2.message
						: 'Error al cargar productos.';
			productsLoadError = msg;
			// Si ya hay datos visibles, no interrumpir con toast de error de background refresh.
			const hasVisibleData = products.length > 0;
			if (!hasVisibleData) toastsStore.error(msg);
			scheduleProductsRetry();
			// POS always-on: mantener el último estado visible, no vaciar la UI.
		} finally {
			productsLoading = false;
			productsLoadInFlight = null;
		}
		})();
		return productsLoadInFlight;
	};

	const storeProducts = $derived($productsState.products);
	const selectedProduct = $derived(products.find((p) => p.id === targetProductId) ?? null);
	const groups = $derived(targetProductId ? $productsState.getGroupsByProduct(targetProductId) : []);
	const totalProducts = $derived(products.length);

	// Búsqueda global por nombre, descripción y categoría(s); filtro por categoría.
	const filteredProducts = $derived.by(() => {
		let list = products;
		if (categoryFilterId) {
			list = list.filter((p) => getProductCategoryIds(p).includes(categoryFilterId));
		}
		const q = String(searchQuery).trim().toLowerCase();
		if (!q) return list;
		return list.filter((p) => {
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
	const activeProductsCount = $derived(products.filter((p) => p.active).length);
	const inactiveProductsCount = $derived(products.filter((p) => !p.active).length);
	const allSelected = $derived(totalProducts > 0 && selectedProductIds.length === totalProducts);

	const getCategoryNode = (pc: ProductCategoryLink): { id: string; name: string } | null =>
		Array.isArray(pc.categories) ? pc.categories[0] ?? null : pc.categories;

	const getProductCategoryIds = (p: SupabaseProduct): string[] =>
		(p.product_categories ?? [])
			.map((pc) => getCategoryNode(pc)?.id ?? pc.category_id)
			.filter(Boolean);

	const getProductCategoryNames = (p: SupabaseProduct): string =>
		(p.product_categories ?? [])
			.map((pc) => getCategoryNode(pc)?.name)
			.filter(Boolean)
			.join(', ') || '—';

	const getProductCategoryNamesArray = (p: SupabaseProduct): string[] =>
		(p.product_categories ?? []).map((pc) => getCategoryNode(pc)?.name).filter(Boolean) as string[];

	const openNewProduct = () => {
		targetProductId = null;
		editingProductId = null;
		showImageUrlInput = false;
		productForm = { name: '', base_price: 0, active: true, image_url: '', category_ids: [], groups: [] };
		detailDrawerOpen = true;
	};

	const uploadProductImage = async (file: File): Promise<string | null> => {
		const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
		const path = `product-images/${crypto.randomUUID()}.${ext}`;
		const { data, error } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).upload(path, file, {
			cacheControl: '3600',
			upsert: false,
			contentType: file.type || 'image/jpeg'
		});
		if (error) {
			console.error('Supabase Storage upload error:', error);
			const msg = error.message || 'Error al subir la imagen';
			toastsStore.error(msg);
			return null;
		}
		const { data: urlData } = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(data.path);
		return urlData.publicUrl;
	};

	const onProductImageChange = async (e: Event) => {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file || !file.type.startsWith('image/')) {
			if (file) toastsStore.error('Elegí una imagen (JPG, PNG, etc.)');
			return;
		}
		productImageUploading = true;
		const previousUrl = productForm.image_url?.trim() || '';
		const url = await uploadProductImage(file);
		if (url) {
			if (previousUrl) await removeStorageFileIfOurs(PRODUCT_IMAGES_BUCKET, previousUrl);
			productForm = { ...productForm, image_url: url };
		}
		productImageUploading = false;
		input.value = '';
	};

	const openEditProduct = (id: string) => {
		const product = products.find((p) => p.id === id);
		if (!product) return;
		targetProductId = id;
		editingProductId = id;
		const categoryIds = 'product_categories' in product ? getProductCategoryIds(product as SupabaseProduct) : [];
		const imageUrl = (product as SupabaseProduct).image_url?.trim() ?? '';
		// Abrir el drawer de inmediato con los datos que ya tenemos; los grupos se cargan en segundo plano en el $effect
		productForm = {
			name: product.name,
			base_price: getProductPrice(product) as number,
			active: product.active,
			image_url: imageUrl,
			category_ids: categoryIds,
			groups: []
		};
		detailDrawerOpen = true;
		// Si la lista de grupos del sistema no está cargada, cargarla para que se vean los grupos asociados al producto
		if (productGroupsList.length === 0) {
			void loadProductGroups();
		}
	};

	const SAVE_TIMEOUT_MS = 70_000;
	const saveProduct = async () => {
		const parsed = productCreateSchema.safeParse(productForm);
		if (!parsed.success) {
			toastsStore.error(parsed.error.issues[0]?.message ?? 'Datos inválidos');
			return;
		}
		const timeoutId = setTimeout(() => {
			savingProduct = false;
			toastsStore.error('El guardado tardó demasiado. Reintentá.');
		}, SAVE_TIMEOUT_MS);
		try {
			await asyncGuard(
				async () => {
					const isSupabaseProduct = editingProductId && supabaseProducts.some((p) => p.id === editingProductId);
					if (editingProductId) {
						if (isSupabaseProduct) {
							await api.products.updateProduct(editingProductId, {
								name: parsed.data.name,
								description: parsed.data.name,
								price: parsed.data.base_price,
								active: parsed.data.active,
								image_url: productForm.image_url?.trim() || null,
								updated_at: new Date().toISOString()
							});
							await api.products.setProductCategories(editingProductId, productForm.category_ids);
							await api.products.setProductGroups(editingProductId, productForm.groups);
							// Actualizar lista local de inmediato (incl. image_url) para que al reabrir el editor se vea la foto
							const imageUrl = productForm.image_url?.trim() || null;
							products = products.map((p) =>
								p.id === editingProductId
									? {
											...p,
											name: parsed.data.name,
											description: parsed.data.name,
											price: parsed.data.base_price,
											active: parsed.data.active,
											image_url: imageUrl
										}
									: p
							);
							supabaseProducts = supabaseProducts.map((p) =>
								p.id === editingProductId
									? {
											...p,
											name: parsed.data.name,
											description: parsed.data.name,
											price: parsed.data.base_price,
											active: parsed.data.active,
											image_url: imageUrl
										}
									: p
							);
							toastsStore.success('Producto actualizado');
							await loadSupabaseProducts();
						} else {
							productsStore.getState().updateProduct(editingProductId, parsed.data);
							toastsStore.success('Producto actualizado');
						}
					} else {
						// New product
						if (useSupabase && supabaseProducts.length > 0) {
							const inserted = await api.products.createProduct({
								name: parsed.data.name,
								description: parsed.data.name,
								price: parsed.data.base_price,
								active: parsed.data.active,
								image_url: productForm.image_url?.trim() || null
							});
							const newId = inserted?.id;
							if (newId) {
								await api.products.setProductCategories(newId, productForm.category_ids);
								await api.products.setProductGroups(newId, productForm.groups);
							}
							toastsStore.success('Producto creado');
							await loadSupabaseProducts();
						} else {
							const created = productsStore.getState().createProduct(parsed.data);
							targetProductId = created.id;
							toastsStore.success('Producto creado');
						}
					}
					detailDrawerOpen = false;
					productDialogOpen = false;
					editingProductId = null;
					targetProductId = null;
				},
				{
					setLoading: (value) => (savingProduct = value),
					onError: (e) => {
						toastsStore.error(
							isTimeoutError(e) ? 'Guardado agotó el tiempo de espera' : 'No se pudo guardar el producto.'
						);
					}
				}
			);
		} finally {
			clearTimeout(timeoutId);
			savingProduct = false;
		}
	};

	const removeProduct = async (id: string, skipConfirm = false) => {
		if (!skipConfirm && !confirm('¿Eliminar producto? (soft delete)')) return;
		const isSupabaseProduct = supabaseProducts.some((p) => p.id === id);
		if (isSupabaseProduct) {
			await asyncGuard(
				async () => {
					await api.products.deactivateProduct(id);
					toastsStore.success('Producto desactivado');
					if (targetProductId === id) targetProductId = null;
					await loadSupabaseProducts();
				},
				{
					onError: (e) => {
						toastsStore.error(
							isTimeoutError(e) ? 'Eliminación agotó el tiempo de espera' : 'No se pudo desactivar el producto'
						);
					}
				}
			);
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
		const cached = posDataCache.get<SupabaseProduct[]>(PRODUCTS_CACHE_KEY);
		if (cached?.length) {
			supabaseProducts = cached;
			products = cached.filter((p) => p.active);
			productsLoading = false;
			productsLoadError = null;
		}
		void loadCategories();
		void loadProductGroups();
		void loadSupabaseProducts();
		const stuckIntervalId = setInterval(() => {
			const stuck = productsLoading && products.length === 0 && Date.now() - productsLoadStartedAt > PRODUCTS_STUCK_RELOAD_MS;
			if (!stuck) return;
			tryPosSelfHealReload(PRODUCTS_SELFHEAL_SCREEN_KEY);
		}, 2_000);
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
		let firstRefresh = true;
		const unsub = refreshTrigger.subscribe(() => {
			if (firstRefresh) {
				firstRefresh = false;
				return;
			}
			void loadCategories();
			void loadProductGroups();
			void loadSupabaseProducts();
			// Si el drawer de edición está abierto, recargar grupos y asignaciones para que no quede "No hay grupos definidos"
			if (productDrawerRef.open && productDrawerRef.editingId && productDrawerRef.useSupabase && productDrawerRef.hasProducts) {
				void loadProductGroups();
				loadProductGroupAssignments(productDrawerRef.editingId)
					.then((groups) => {
						if (productDrawerRef.open && productDrawerRef.editingId) productForm = { ...productForm, groups };
					})
					.catch(() => {});
			}
		});
		return () => {
			unsub();
			clearProductsRetry();
			clearInterval(stuckIntervalId);
		};
	});

	// Ref para que el callback de refreshTrigger lea el estado actual del drawer
	const productDrawerRef = { open: false, editingId: null as string | null, useSupabase: false, hasProducts: false };
	$effect(() => {
		productDrawerRef.open = detailDrawerOpen;
		productDrawerRef.editingId = editingProductId;
		productDrawerRef.useSupabase = useSupabase;
		productDrawerRef.hasProducts = supabaseProducts.length > 0;
	});

	$effect(() => {
		if (!detailDrawerOpen) {
			if (drawerLoadController) {
				drawerLoadController.abort();
				drawerLoadController = null;
			}
		}
	});

	$effect(() => {
		if (selectedProduct && detailDrawerOpen) {
			showImageUrlInput = false;
			groupsAssignmentsLoadError = false;
			const categoryIds = 'product_categories' in selectedProduct ? getProductCategoryIds(selectedProduct as SupabaseProduct) : [];
			const imageUrl = (selectedProduct as SupabaseProduct).image_url?.trim() ?? '';
			productForm = {
				name: selectedProduct.name,
				base_price: getProductPrice(selectedProduct),
				active: selectedProduct.active,
				image_url: imageUrl,
				category_ids: categoryIds,
				groups: []
			};
			if (useSupabase && supabaseProducts.length > 0) {
				if (drawerLoadController) drawerLoadController.abort();
				const controller = new AbortController();
				drawerLoadController = controller;
				const productId = selectedProduct.id;
				const tryLoad = (isRetry = false) => {
					loadProductGroupAssignments(productId, controller.signal)
						.then((groups) => {
							if (controller.signal.aborted || !detailDrawerOpen) return;
							productForm = { ...productForm, groups };
							groupsAssignmentsLoadError = false;
						})
						.catch((e) => {
							if (e instanceof Error && e.name === 'AbortError') return;
							if (!isRetry) {
								// Un único reintento automático antes de mostrar error
								setTimeout(() => {
									if (controller.signal.aborted || !detailDrawerOpen) return;
									tryLoad(true);
								}, 400);
								return;
							}
							groupsAssignmentsLoadError = true;
							// Sin toast: el drawer ya muestra el mensaje con Reintentar
						})
						.finally(() => {
							if (drawerLoadController === controller) drawerLoadController = null;
						});
				};
				tryLoad(false);
			}
		}
	});

	const retryGroupsAssignments = () => {
		if (!selectedProduct) return;
		groupsAssignmentsLoadError = false;
		loadProductGroupAssignments(selectedProduct.id)
			.then((groups) => {
				productForm = { ...productForm, groups };
				groupsAssignmentsLoadError = false;
			})
			.catch(() => {
				groupsAssignmentsLoadError = true;
				// El drawer ya muestra el mensaje; solo toast si el usuario hizo clic en Reintentar
				toastsStore.error('Sigue sin poder cargar los grupos. Revisá la conexión.');
			});
	};

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
	<div class="panel p-4">
		<h1 class="text-base font-semibold">Productos</h1>
		<p class="text-xs text-slate-500 dark:text-slate-400">
			Catálogo de productos, precios, categorías y grupos (sabores, opciones).
		</p>
	</div>

	<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
		<div class="panel p-4">
			<p class="text-sm text-slate-500 dark:text-neutral-400">Total de productos</p>
			<p class="mt-1 text-4xl font-semibold">{totalProducts}</p>
		</div>
		<div class="panel p-4">
			<p class="text-sm text-slate-500 dark:text-neutral-400">Activos</p>
			<p class="mt-1 text-4xl font-semibold">{activeProductsCount}</p>
		</div>
		<div class="panel p-4">
			<p class="text-sm text-slate-500 dark:text-neutral-400">Inactivos</p>
			<p class="mt-1 text-4xl font-semibold">{inactiveProductsCount}</p>
		</div>
	</div>

	<section class="panel p-4">
		{#if productsLoading && products.length === 0}
			<p class="py-8 text-center text-sm text-slate-500 dark:text-neutral-400">Cargando…</p>
		{:else if productsLoadError && products.length === 0}
			<div class="py-8 text-center text-sm text-amber-600 dark:text-amber-400">
				<p>No se pudieron cargar los productos. Reintentando automáticamente…</p>
				<button class="btn-secondary mt-3" type="button" onclick={() => void loadSupabaseProducts()}>
					Reintentar ahora
				</button>
			</div>
		{:else if products.length === 0}
			<p class="py-8 text-center text-sm text-slate-500 dark:text-neutral-400">
				No hay productos. Creá uno con «+ Add New Product».
			</p>
		{:else}
			{#if productsLoading}
				<p class="mb-3 text-xs text-slate-500 dark:text-neutral-400">
					Actualizando datos en segundo plano…
				</p>
			{/if}
			<!-- Búsqueda, filtro por categoría y botón Nuevo producto -->
			{#if browser}
				<div class="mb-4 flex flex-wrap items-end gap-3">
					<div class="min-w-0 flex-1">
						<label for="products-search" class="block text-sm font-medium text-slate-700 dark:text-neutral-300">Buscar</label>
						<input
							id="products-search"
							type="search"
							class="input mt-1 w-full min-w-[18rem]"
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
					<div class="w-48 shrink-0">
						<label for="products-category-filter" class="block text-sm font-medium text-slate-700 dark:text-neutral-300">Categoría</label>
						<select
							id="products-category-filter"
							class="input mt-1 w-full"
							aria-label="Filtrar por categoría"
							value={categoryFilterId}
							onchange={(e) => {
								categoryFilterId = (e.currentTarget as HTMLSelectElement).value;
								pageIndex = 0;
								persistProductsTable();
							}}
						>
							<option value="">Todas</option>
							{#each categoriesList as cat}
								<option value={cat.id}>{cat.name}</option>
							{/each}
						</select>
					</div>
					<div class="shrink-0">
						<button type="button" class="btn-primary" onclick={openNewProduct}>+ Nuevo producto</button>
					</div>
				</div>
			{/if}

			{#if !browser}
				<div class="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
					Cargando tabla…
				</div>
			{:else if !table}
				<div class="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
					Cargando tabla…
				</div>
			{:else}
				<div class="overflow-auto">
					<table class="min-w-full text-sm">
						<thead class="sticky top-0 z-10 bg-slate-50 dark:bg-neutral-900">
							<tr>
								<th class="w-14 px-2 py-2 text-left font-medium text-slate-600 dark:text-neutral-300" scope="col">Foto</th>
								<th class="px-3 py-2 text-left">
									<button
										type="button"
										class="flex items-center gap-1 font-medium hover:text-slate-700 dark:hover:text-neutral-200"
										onclick={() => setSort('name')}
									>
										Nombre {SortIcon('name')}
									</button>
								</th>
								<th class="px-3 py-2 text-left">
									<button
										type="button"
										class="flex items-center gap-1 font-medium hover:text-slate-700 dark:hover:text-neutral-200"
										onclick={() => setSort('category')}
									>
										Categoría {SortIcon('category')}
									</button>
								</th>
								<th class="px-3 py-2 text-left">
									<button
										type="button"
										class="flex items-center gap-1 font-medium hover:text-slate-700 dark:hover:text-neutral-200"
										onclick={() => setSort('code')}
									>
										Código {SortIcon('code')}
									</button>
								</th>
								<th class="px-3 py-2 text-right">
									<button
										type="button"
										class="ml-auto flex items-center justify-end gap-1 font-medium hover:text-slate-700 dark:hover:text-neutral-200"
										onclick={() => setSort('price')}
									>
										Precio {SortIcon('price')}
									</button>
								</th>
								<th class="px-3 py-2 text-right">
									<button
										type="button"
										class="ml-auto flex items-center gap-1 font-medium hover:text-slate-700 dark:hover:text-neutral-200"
										onclick={() => setSort('state')}
									>
										Estado {SortIcon('state')}
									</button>
								</th>
								<th class="px-3 py-2 text-right font-medium text-slate-600 dark:text-neutral-300">Acciones</th>
							</tr>
						</thead>
						<tbody>
							{#each paginatedRows as row}
								{@const product = row.original}
								{@const meta = buildMeta(product, row.index)}
								<tr class="border-t border-slate-100 transition hover:bg-slate-50 dark:border-neutral-800 dark:hover:bg-neutral-900/60">
									<td class="w-14 px-2 py-2 align-middle">
										{#if product.image_url?.trim()}
											<img
												src={product.image_url}
												alt=""
												class="h-10 w-10 rounded-md object-cover border border-slate-200 dark:border-neutral-700"
												loading="lazy"
											/>
										{:else}
											<div
												class="flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-slate-100 text-slate-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400"
												title="Sin imagen"
											>
												<svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" aria-hidden="true">
													<path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
												</svg>
											</div>
										{/if}
									</td>
									<td class="px-3 py-2">
										<button
											type="button"
											class="cursor-pointer text-left font-medium text-slate-900 underline-offset-2 hover:underline hover:text-slate-700 dark:text-neutral-100 dark:hover:text-neutral-300"
											title="Clic para editar"
											onclick={() => void openEditProduct(product.id)}
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
															class="inline-flex rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-neutral-600 dark:text-neutral-200"
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
									<td class="px-3 py-2 text-right">{formatMoney(getProductPrice(product))}</td>
									<td class="px-3 py-2 text-right">
										<span
											class="inline-flex rounded-full px-2 py-1 text-xs font-medium"
											class:bg-emerald-100={product.active}
											class:text-emerald-700={product.active}
											class:bg-slate-200={!product.active}
											class:text-slate-600={!product.active}
											class:dark:bg-emerald-900={product.active}
											class:dark:text-emerald-200={product.active}
											class:dark:bg-neutral-800={!product.active}
											class:dark:text-neutral-400={!product.active}
										>
											{product.active ? 'Activo' : 'Inactivo'}
										</span>
									</td>
									<td class="px-3 py-2 text-right">
										<div class="inline-flex items-center gap-1">
											<button
												type="button"
												title="Editar"
												aria-label="Editar"
												class="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-200 text-slate-600 transition hover:bg-slate-100 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
												onclick={() => void openEditProduct(product.id)}
											>
												<svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
													<path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
												</svg>
											</button>
											<button
												type="button"
												title="Eliminar (desactivar)"
												aria-label="Eliminar"
												class="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-200 text-red-600 transition hover:bg-red-50 dark:border-neutral-600 dark:text-red-400 dark:hover:bg-red-950/40"
												onclick={() => {
													productToDeleteId = product.id;
													deleteConfirmOpen = true;
												}}
											>
												<svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
													<path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
												</svg>
											</button>
										</div>
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
			class="fixed right-0 top-0 z-50 flex h-screen w-[500px] max-w-[95vw] flex-col border-l border-slate-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-black"
		>
			<div class="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-neutral-800">
				<h2 class="text-lg font-semibold">{selectedProduct ? 'Editar producto' : 'Nuevo producto'}</h2>
				<Dialog.Close
					class="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-neutral-900 dark:hover:text-neutral-200"
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
					<div class="block space-y-2">
						<span class="text-sm font-medium">Imagen del producto</span>
						<p class="text-xs text-slate-500 dark:text-neutral-400">Una sola imagen por producto en el front. Se muestra cuadrada (recorte al centro).</p>
						<input
							id="product-image-input"
							type="file"
							accept="image/*"
							class="sr-only"
							disabled={productImageUploading}
							onchange={onProductImageChange}
						/>
						<div class="flex flex-col items-start gap-2">
							{#if productForm.image_url}
								<div class="relative inline-block">
									<div class="h-32 w-32 overflow-hidden rounded-lg border border-slate-200 dark:border-neutral-700">
										<img
											src={productForm.image_url}
											alt="Vista previa"
											class="h-full w-full object-cover object-center"
										/>
									</div>
									<button
										type="button"
										class="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-slate-700 text-white shadow hover:bg-slate-800 dark:bg-neutral-600 dark:hover:bg-neutral-700"
										title="Quitar imagen"
										aria-label="Quitar imagen"
										onclick={() => (productForm = { ...productForm, image_url: '' })}
									>
										<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
									</button>
									<label
										for="product-image-input"
										class="mt-1.5 inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-slate-600 underline-offset-2 hover:underline dark:text-neutral-400 dark:hover:text-neutral-300"
										tabindex="0"
									>
										<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
										Actualizar foto
									</label>
									<button
										type="button"
										class="text-xs text-slate-500 hover:text-slate-700 dark:text-neutral-400 dark:hover:text-neutral-300"
										onclick={() => {
											showImageUrlInput = !showImageUrlInput;
											if (showImageUrlInput) imageUrlInputValue = productForm.image_url ?? '';
										}}
									>
										O usar URL
									</button>
									{#if showImageUrlInput}
										<div class="flex w-full max-w-xs items-center gap-1">
											<input
												type="url"
												class="input flex-1 py-1.5 text-xs"
												placeholder="https://..."
												bind:value={imageUrlInputValue}
												onkeydown={(e) => {
												if (e.key === 'Enter') {
													productForm = { ...productForm, image_url: imageUrlInputValue.trim() };
													showImageUrlInput = false;
												}
											}}
												onblur={() => {
													const url = imageUrlInputValue.trim();
													if (url) productForm = { ...productForm, image_url: url };
												}}
											/>
											<button
												type="button"
												class="btn-secondary py-1.5 text-xs"
												onclick={() => {
													productForm = { ...productForm, image_url: imageUrlInputValue.trim() };
													showImageUrlInput = false;
												}}
											>
												OK
											</button>
										</div>
									{/if}
								</div>
							{:else}
								<label
									for="product-image-input"
									class="flex h-32 w-32 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 text-sm text-slate-600 transition hover:border-slate-400 hover:bg-slate-50 dark:border-neutral-600 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:bg-neutral-800/50"
								>
									{#if productImageUploading}
										<span class="animate-pulse text-xs">Subiendo…</span>
									{:else}
										<svg class="h-8 w-8 text-slate-400 dark:text-neutral-500" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
										<span>Subir imagen</span>
									{/if}
								</label>
								<button
									type="button"
									class="text-xs text-slate-500 hover:text-slate-700 dark:text-neutral-400 dark:hover:text-neutral-300"
									onclick={() => {
										showImageUrlInput = !showImageUrlInput;
										if (showImageUrlInput) imageUrlInputValue = productForm.image_url ?? '';
									}}
								>
									O usar URL
								</button>
								{#if showImageUrlInput}
									<div class="flex w-full max-w-xs items-center gap-1">
										<input
											type="url"
											class="input flex-1 py-1.5 text-xs"
											placeholder="https://..."
											bind:value={imageUrlInputValue}
											onkeydown={(e) => {
												if (e.key === 'Enter') {
													productForm = { ...productForm, image_url: imageUrlInputValue.trim() };
													showImageUrlInput = false;
												}
											}}
											onblur={() => {
												const url = imageUrlInputValue.trim();
												if (url) productForm = { ...productForm, image_url: url };
											}}
										/>
										<button
											type="button"
											class="btn-secondary py-1.5 text-xs"
											onclick={() => {
												productForm = { ...productForm, image_url: imageUrlInputValue.trim() };
												showImageUrlInput = false;
											}}
										>
											OK
										</button>
									</div>
								{/if}
							{/if}
						</div>
					</div>
					<label class="block space-y-1">
						<span class="text-sm font-medium">Nombre</span>
						<input class="input" bind:value={productForm.name} />
					</label>
					{#if useSupabase && supabaseProducts.length > 0 && categoriesList.length > 0}
						<div class="block space-y-2">
							<span class="text-sm font-medium">Categorías</span>
							<div class="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-neutral-800">
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

				<div class="mt-6 border-t border-slate-200 pt-4 dark:border-neutral-800">
					<div class="mb-3">
						<h3 class="text-base font-semibold">Grupos de opciones</h3>
						<p class="text-xs text-slate-500 dark:text-neutral-400">
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
						{#if groupsAssignmentsLoadError}
							<div class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
								No se cargaron las asignaciones de grupos. Podés guardar igual; para volver a cargarlas usá Reintentar.
								<button type="button" class="btn-primary mt-2 !py-1.5 text-xs" onclick={() => retryGroupsAssignments()}>
									Reintentar
								</button>
							</div>
						{:else if productGroupsList.length === 0}
							<div class="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-neutral-800 dark:text-neutral-400">
								No hay grupos definidos. Creálos en la sección <strong>Grupos</strong> del menú.
							</div>
						{:else}
							<div class="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-neutral-800">
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
												<span class="whitespace-nowrap text-slate-500 dark:text-neutral-400">Máx. a elegir:</span>
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
							<div class="rounded-lg border border-dashed border-slate-300 p-4 text-sm dark:border-neutral-800">
								Aún no hay grupos (solo para productos del almacén local).
							</div>
						{:else}
							<div class="space-y-3">
								{#each groups as group}
									<div class="rounded-lg border border-slate-200 p-3 dark:border-neutral-800">
										<div class="flex items-center justify-between">
											<div>
												<p class="text-sm font-semibold">{group.name}</p>
												<p class="text-xs text-slate-500 dark:text-neutral-400">
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
											<div class="mt-3 space-y-2 border-t border-slate-200 pt-3 dark:border-neutral-800">
												<div class="flex items-center justify-between">
													<p class="text-xs font-medium text-slate-600 dark:text-neutral-300">Opciones</p>
													<button class="btn-secondary !px-2 !py-1 text-xs" onclick={() => openOptionDialog(group.id)}>
														Nueva opción
													</button>
												</div>
												{#each optionsByGroup(group.id) as option}
													<div class="flex items-center justify-between rounded border border-slate-200 px-2 py-1 text-sm dark:border-neutral-800">
														<div>
															<p class="font-medium">{option.name}</p>
															<p class="text-xs text-slate-500 dark:text-neutral-400">
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
				<div class="flex shrink-0 justify-between gap-3 border-t border-slate-200 bg-white p-4 dark:border-neutral-800 dark:bg-black">
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
		<Dialog.Content class="fixed left-1/2 top-1/2 z-[60] w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-neutral-800 dark:bg-black">
			<p class="mb-4 text-sm text-slate-600 dark:text-neutral-300">
				¿Está seguro que desea eliminar este producto?
			</p>
			<div class="flex justify-end gap-2">
				<Dialog.Close class="btn-secondary" onclick={() => (productToDeleteId = null)}>Cancelar</Dialog.Close>
				<button
					class="btn-danger"
					onclick={async () => {
						const id = productToDeleteId ?? selectedProduct?.id;
						if (id) {
							await removeProduct(id, true);
							productToDeleteId = null;
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
		<Dialog.Content class="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-4 dark:bg-black">
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
		<Dialog.Content class="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-4 dark:bg-black">
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
		<Dialog.Content class="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-4 dark:bg-black">
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
