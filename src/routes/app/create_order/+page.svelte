<script lang="ts">
	import { Dialog } from 'bits-ui';
	import {
		computeOrderItemPrice,
		validateSelections,
		type ProductOption as ConfigOption,
		type ProductOptionGroup
	} from '$lib/schema/product-options';
	import { customerSchema } from '$lib/schemas';
	import { supabase } from '$lib/supabase/client';
	import { catalogStore } from '$lib/stores/catalog';
	import { customersStore } from '$lib/stores/customers';
	import { ordersStore } from '$lib/stores/orders';
	import { productsStore } from '$lib/stores/productsStore';
	import { sessionStore } from '$lib/stores/session';
	import { shiftsStore } from '$lib/stores/shifts';
	import { toastsStore } from '$lib/stores/toasts';
	import { fromZustand } from '$lib/stores/zustandBridge';
	import type { Customer, OrderItem, PaymentMethod, Product, SKU } from '$lib/types';
	import { generateId, formatMoney } from '$lib/utils';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	type OrderDraft = {
		id: string;
		title: string;
		selectedCustomerId: string | null;
		categoryId: string;
		cart: OrderItem[];
		paymentMethod: PaymentMethod;
		cashReceived: number;
		notes: string;
	};

	let draftCount = 1;
	let drafts = $state<OrderDraft[]>([]);
	let activeDraftId = $state('');
	let productSearch = $state('');
	let productsViewMode = $state<'cards' | 'list'>('cards');
	let clientModalOpen = $state(false);
	/** true = cambiar cliente del draft actual; false = crear nuevo draft con el cliente */
	let clientModalForChange = $state(false);
	let clientSearch = $state('');
	let addClientMode = $state(false);
	let newClientForm = $state({ phone: '', address: '', betweenStreets: '', notes: '' });
	let configOpen = $state(false);
	let configLoading = $state(false);
	let configError = $state('');
	let configTarget: { sku: SKU; product: Product } | null = null;
	let configGroups: ProductOptionGroup[] = [];
	/** Opciones por grupo cuando se cargan desde Supabase (product_group_items) */
	let supabaseOptionsByGroup = $state<Record<string, ConfigOption[]>>({});
	let selectionsByGroup: Record<string, string[]> = {};
	let optionQtyById: Record<string, number> = {};
	const productsOptionsState = fromZustand(productsStore);

	// Catálogo desde Supabase (categorías + productos) para filtrar por categoría, no por grupo
	type SupabaseCategory = { id: string; name: string; sort_order: number };
	type SupabaseProductRow = {
		id: string;
		name: string;
		description: string;
		price: number;
		image_url?: string | null;
		product_categories?: { category_id: string }[];
	};
	let supabaseCategories = $state<SupabaseCategory[]>([]);
	let supabaseProductsRaw = $state<SupabaseProductRow[]>([]);
	const loadSupabaseCatalog = async () => {
		const [catRes, prodRes] = await Promise.all([
			supabase.from('categories').select('id, name, sort_order').eq('active', true).order('sort_order', { ascending: true }),
			supabase.from('products').select('id, name, description, price, image_url, product_categories(category_id)').eq('active', true).order('name', { ascending: true })
		]);
		if (!catRes.error && catRes.data) supabaseCategories = catRes.data as SupabaseCategory[];
		if (!prodRes.error && prodRes.data) supabaseProductsRaw = prodRes.data as SupabaseProductRow[];
	};
	const useSupabaseCatalog = $derived(supabaseCategories.length > 0 && supabaseProductsRaw.length > 0);
	const supabaseProductsAsCatalog = $derived(
		supabaseProductsRaw.map((p) => ({
			id: p.id,
			name: p.name,
			description: p.description ?? '',
			imageUrl: p.image_url ?? undefined,
			categoryId: (p.product_categories ?? [])[0]?.category_id ?? '',
			categoryIds: (p.product_categories ?? []).map((pc) => pc.category_id)
		}))
	);
	const supabaseSkus = $derived(
		supabaseProductsRaw.map((p) => ({
			id: p.id,
			productId: p.id,
			label: 'Unidad',
			price: p.price
		}))
	);

	const createDraft = (index: number): OrderDraft => ({
		id: generateId('draft'),
		title: `Pedido ${index}`,
		selectedCustomerId: null,
		categoryId: 'all',
		cart: [],
		paymentMethod: 'CASH',
		cashReceived: 0,
		notes: ''
	});

	const updateActiveDraft = (updater: (draft: OrderDraft) => OrderDraft) => {
		drafts = drafts.map((draft) => (draft.id === activeDraftId ? updater(draft) : draft));
	};

	const updateDraftById = (id: string, updater: (draft: OrderDraft) => OrderDraft) => {
		drafts = drafts.map((draft) => (draft.id === id ? updater(draft) : draft));
	};

	const activeDraft = $derived(drafts.find((d) => d.id === activeDraftId) ?? null);
	const categories = $derived(
		useSupabaseCatalog
			? supabaseCategories.map((c) => ({ id: c.id, name: c.name, sort: c.sort_order })).sort((a, b) => a.sort - b.sort)
			: $catalogStore.categories
	);
	const products = $derived(
		useSupabaseCatalog
			? supabaseProductsAsCatalog.filter((p) => {
					const selectedCategory = activeDraft?.categoryId ?? 'all';
					if (selectedCategory !== 'all' && !(p as { categoryIds?: string[] }).categoryIds?.includes(selectedCategory))
						return false;
					if (!productSearch.trim()) return true;
					const txt = `${p.name} ${p.description}`.toLowerCase();
					return txt.includes(productSearch.toLowerCase());
				})
			: $catalogStore.products.filter((p) => {
					const selectedCategory = activeDraft?.categoryId ?? 'all';
					if (selectedCategory !== 'all' && p.categoryId !== selectedCategory) return false;
					if (!productSearch.trim()) return true;
					const txt = `${p.name} ${p.description}`.toLowerCase();
					return txt.includes(productSearch.toLowerCase());
				})
	);
	const selectedCustomer = $derived(
		activeDraft ? ($customersStore.find((c) => c.id === activeDraft.selectedCustomerId) ?? null) : null
	);
	const total = $derived(activeDraft ? activeDraft.cart.reduce((acc, item) => acc + item.subtotal, 0) : 0);
	const changeDue = $derived(
		activeDraft && activeDraft.paymentMethod === 'CASH' ? Math.max(0, activeDraft.cashReceived - total) : 0
	);

	const draftCustomer = (draft: OrderDraft) =>
		$customersStore.find((c) => c.id === draft.selectedCustomerId) ?? null;
	const draftTotal = (draft: OrderDraft) => draft.cart.reduce((acc, item) => acc + item.subtotal, 0);

	const filteredClients = $derived(
		$customersStore.filter((c) => {
			const q = clientSearch.trim().toLowerCase();
			if (!q) return true;
			return (
				c.phone.toLowerCase().includes(q) ||
				c.address.toLowerCase().includes(q) ||
				(c.betweenStreets ?? '').toLowerCase().includes(q)
			);
		})
	);

	/** Cliente existente con el mismo teléfono al agregar uno nuevo */
	const existingCustomerWithPhone = $derived(
		newClientForm.phone.replace(/\D/g, '').length >= 6
			? $customersStore.find((c) => c.phone.replace(/\D/g, '') === newClientForm.phone.replace(/\D/g, ''))
			: null
	);

	const openClientModal = (forChange = false) => {
		clientSearch = '';
		addClientMode = false;
		clientModalForChange = forChange;
		newClientForm = { phone: '', address: '', betweenStreets: '', notes: '' };
		clientModalOpen = true;
	};

	const selectClient = (customer: Customer) => {
		if (clientModalForChange && activeDraft) {
			updateActiveDraft((draft) => ({ ...draft, selectedCustomerId: customer.id }));
			clientModalOpen = false;
			clientModalForChange = false;
			return;
		}
		draftCount += 1;
		const newDraft = createDraft(draftCount);
		newDraft.selectedCustomerId = customer.id;
		drafts = [...drafts, { ...newDraft, selectedCustomerId: customer.id }];
		activeDraftId = newDraft.id;
		clientModalOpen = false;
	};

	const addNewClient = async () => {
		if (existingCustomerWithPhone) {
			toastsStore.error('Ya existe un cliente con este teléfono. Usá el botón «Usar este cliente».');
			return;
		}
		const parsed = customerSchema.safeParse(newClientForm);
		if (!parsed.success) {
			toastsStore.error(parsed.error.issues[0]?.message ?? 'Datos inválidos');
			return;
		}
		try {
			const created = await customersStore.create(parsed.data);
			toastsStore.success('Cliente creado');
			selectClient(created);
		} catch {
			toastsStore.error('No se pudo crear el cliente');
		}
	};
	const qtyBySku = (skuId: string) => activeDraft?.cart.find((item) => item.skuId === skuId)?.qty ?? 0;

	const decSku = (sku: SKU) => {
		if (!activeDraft) return;
		const item = activeDraft.cart.find((i) => i.skuId === sku.id);
		if (!item) return;
		changeQty(item.id, 'down');
	};

	const findSkusByProduct = (productId: string): SKU[] =>
		useSupabaseCatalog
			? supabaseSkus.filter((sku) => sku.productId === productId)
			: $catalogStore.skus.filter((sku) => sku.productId === productId);

	const getConfigOptions = (groupId: string): ConfigOption[] =>
		supabaseOptionsByGroup[groupId]?.length
			? supabaseOptionsByGroup[groupId].filter((o) => o.active)
			: $productsOptionsState.getOptionsByGroup(groupId).filter((option) => option.active);

	const toggleOption = (group: ProductOptionGroup, optionId: string) => {
		const current = selectionsByGroup[group.id] ?? [];
		if (group.max_select === 1) {
			selectionsByGroup = { ...selectionsByGroup, [group.id]: [optionId] };
			return;
		}
		if (current.includes(optionId)) {
			selectionsByGroup = {
				...selectionsByGroup,
				[group.id]: current.filter((id) => id !== optionId)
			};
			return;
		}
		if (current.length >= group.max_select) return;
		selectionsByGroup = { ...selectionsByGroup, [group.id]: [...current, optionId] };
	};

	const openConfig = async (sku: SKU, product: Product) => {
		if (useSupabaseCatalog) {
			configLoading = true;
			configError = '';
			try {
				const { data: assignments, error: assignErr } = await supabase
					.from('product_product_groups')
					.select('group_id, max_select')
					.eq('product_id', product.id);
				if (assignErr || !assignments?.length) {
					addSku(sku, product);
					return;
				}
				const groupIds = assignments.map((a) => a.group_id);
				const [groupsRes, itemsRes] = await Promise.all([
					supabase.from('product_groups').select('id, name, sort_order').in('id', groupIds),
					supabase.from('product_group_items').select('id, group_id, name, sort_order, active').in('group_id', groupIds).order('sort_order', { ascending: true }).order('name', { ascending: true })
				]);
				const groupsData = (groupsRes.data ?? []) as { id: string; name: string; sort_order: number }[];
				const itemsData = (itemsRes.data ?? []) as { id: string; group_id: string; name: string; sort_order: number; active: boolean }[];
				const now = new Date().toISOString();
				const groups: ProductOptionGroup[] = groupsData.map((g) => {
					const assignment = assignments.find((a) => a.group_id === g.id);
					return {
						id: g.id,
						product_id: product.id,
						name: g.name,
						min_select: 0,
						max_select: Math.max(1, assignment?.max_select ?? 1),
						sort_order: g.sort_order ?? 0,
						created_at: now,
						updated_at: now
					};
				}).sort((a, b) => a.sort_order - b.sort_order);
				const optionsByGroup: Record<string, ConfigOption[]> = {};
				for (const item of itemsData) {
					if (!item.active) continue;
					const opt: ConfigOption = {
						id: item.id,
						group_id: item.group_id,
						name: item.name,
						price_delta: 0,
						active: true,
						sort_order: item.sort_order ?? 0,
						created_at: now,
						updated_at: now
					};
					if (!optionsByGroup[item.group_id]) optionsByGroup[item.group_id] = [];
					optionsByGroup[item.group_id].push(opt);
				}
				configTarget = { sku, product };
				configGroups = groups;
				supabaseOptionsByGroup = optionsByGroup;
				selectionsByGroup = Object.fromEntries(groups.map((g) => [g.id, []]));
				optionQtyById = {};
				configOpen = true;
			} finally {
				configLoading = false;
			}
			return;
		}
		const groups = $productsOptionsState.getGroupsByProduct(product.id);
		if (groups.length === 0) {
			addSku(sku, product);
			return;
		}
		configTarget = { sku, product };
		configGroups = groups;
		supabaseOptionsByGroup = {};
		configError = '';
		selectionsByGroup = Object.fromEntries(groups.map((g) => [g.id, []]));
		optionQtyById = {};
		configOpen = true;
	};

	const canAddConfigured = () =>
		configGroups.every((group) => validateSelections(group, selectionsByGroup[group.id] ?? []).ok);

	const addConfiguredProduct = () => {
		if (!configTarget || !activeDraft) return;
		const target = configTarget;
		for (const group of configGroups) {
			const result = validateSelections(group, selectionsByGroup[group.id] ?? []);
			if (!result.ok) {
				configError = result.message;
				return;
			}
		}

		const selectedOptionRecords = configGroups.flatMap((group) => {
			const ids = selectionsByGroup[group.id] ?? [];
			return getConfigOptions(group.id)
				.filter((opt) => ids.includes(opt.id))
				.map((opt) => ({
					optionId: opt.id,
					groupId: group.id,
					nameSnapshot: opt.name,
					priceDelta: opt.price_delta,
					qty: Math.max(1, optionQtyById[opt.id] ?? 1)
				}));
		});

		const unitPrice = computeOrderItemPrice(
			{ base_price: configTarget.sku.price },
			selectedOptionRecords.map((opt) => ({ price_delta: opt.priceDelta, qty: opt.qty }))
		);
		const signature = selectedOptionRecords
			.map((opt) => `${opt.optionId}:${opt.qty}`)
			.sort()
			.join('|');

		updateActiveDraft((draft) => {
			const exists = draft.cart.find(
				(item) =>
					item.skuId === target.sku.id &&
					(item.selectedOptions ?? [])
						.map((opt) => `${opt.optionId}:${opt.qty}`)
						.sort()
						.join('|') === signature
			);
			if (exists) {
				const cart = draft.cart.map((item) =>
					item.id === exists.id
						? { ...item, qty: item.qty + 1, subtotal: (item.qty + 1) * item.unitPrice }
						: item
				);
				return { ...draft, cart };
			}
			const optionsLabel = selectedOptionRecords.map((opt) => opt.nameSnapshot).join(', ');
			return {
				...draft,
				cart: [
					...draft.cart,
					{
						id: generateId('itm'),
						skuId: target.sku.id,
						nameSnapshot: `${target.product.name} ${target.sku.label}${optionsLabel ? ` (${optionsLabel})` : ''}`,
						qty: 1,
						unitPrice,
						subtotal: unitPrice,
						selectedOptions: selectedOptionRecords
					}
				]
			};
		});

		configOpen = false;
		configTarget = null;
	};

	const addSku = (sku: SKU, product: Product) => {
		if (!activeDraft) return;
		updateActiveDraft((draft) => {
			const exists = draft.cart.find((item) => item.skuId === sku.id);
			if (exists) {
				const cart = draft.cart.map((item) =>
					item.skuId === sku.id
						? { ...item, qty: item.qty + 1, subtotal: (item.qty + 1) * item.unitPrice }
						: item
				);
				return { ...draft, cart };
			}
			return {
				...draft,
				cart: [
					...draft.cart,
					{
						id: generateId('itm'),
						skuId: sku.id,
						nameSnapshot: `${product.name} ${sku.label}`,
						qty: 1,
						unitPrice: sku.price,
						subtotal: sku.price
					}
				]
			};
		});
	};

	const changeQty = (itemId: string, direction: 'up' | 'down') => {
		if (!activeDraft) return;
		updateActiveDraft((draft) => ({
			...draft,
			cart: draft.cart
				.map((item) => {
					if (item.id !== itemId) return item;
					const nextQty = direction === 'up' ? item.qty + 1 : item.qty - 1;
					return { ...item, qty: nextQty, subtotal: nextQty * item.unitPrice };
				})
				.filter((item) => item.qty > 0)
		}));
	};

	const canConfirm = () => Boolean(activeDraft && selectedCustomer && activeDraft.cart.length > 0);

	const confirmOrder = async () => {
		if (!activeDraft || !canConfirm()) {
			toastsStore.error('Seleccioná cliente y al menos un item');
			return;
		}
		await shiftsStore.loadOpen();
		const created = await ordersStore.create({
			customerId: selectedCustomer!.id,
			customerPhoneSnapshot: selectedCustomer!.phone,
			addressSnapshot: selectedCustomer!.address,
			betweenStreetsSnapshot: selectedCustomer!.betweenStreets,
			status: 'NO_ASIGNADO',
			paymentMethod: activeDraft.paymentMethod,
			cashReceived: activeDraft.paymentMethod === 'CASH' ? activeDraft.cashReceived : undefined,
			changeDue: activeDraft.paymentMethod === 'CASH' ? changeDue : undefined,
			notes: activeDraft.notes,
			total,
			cashierNameSnapshot: $sessionStore.user?.name,
			shiftId: $sessionStore.shift?.id,
			items: activeDraft.cart
		});
		toastsStore.success(`Pedido creado: ${created.id}`);
		draftCount += 1;
		const reset = createDraft(draftCount);
		drafts = [reset];
		activeDraftId = reset.id;
		await ordersStore.load();
	};

	const onKeyDown = (e: KeyboardEvent) => {
		if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || document.activeElement?.tagName !== 'TEXTAREA')) {
			e.preventDefault();
			void confirmOrder();
		}
	};

	onMount(() => {
		const customerIdFromUrl = $page.url.searchParams.get('customerId');
		const openClientModalFromUrl = $page.url.searchParams.get('openClientModal') === '1';
		void (async () => {
			await Promise.all([customersStore.load(), catalogStore.load(), shiftsStore.loadOpen()]);
			await loadSupabaseCatalog();
			if (customerIdFromUrl) {
				const customer = $customersStore.find((c) => c.id === customerIdFromUrl);
				if (customer) {
					draftCount += 1;
					const newDraft = createDraft(draftCount);
					newDraft.selectedCustomerId = customer.id;
					drafts = [{ ...newDraft, selectedCustomerId: customer.id }];
					activeDraftId = newDraft.id;
					await goto('/app/create_order', { replaceState: true });
				}
			} else if (openClientModalFromUrl) {
				openClientModal(false);
				await goto('/app/create_order', { replaceState: true });
			}
		})();
		productsStore.getState().hydrate();
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	});
</script>

<div class="grid grid-cols-1 gap-4 xl:grid-cols-12">
	<div class="xl:col-span-8 space-y-4">
		<section class="panel p-3">
			<div class="flex gap-3 overflow-x-auto pb-1 scroll-smooth" role="region" aria-label="Carousel de pedidos">
				{#if drafts.length === 0}
					<button
						type="button"
						class="flex min-h-[120px] min-w-[260px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 px-4 py-6 transition-colors hover:border-slate-400 hover:bg-slate-100/50 dark:border-neutral-600 dark:bg-neutral-900/50 dark:hover:border-neutral-500 dark:hover:bg-neutral-800/50"
						onclick={openClientModal}
					>
						<svg
							class="h-10 w-10 text-slate-400 dark:text-neutral-500"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							aria-hidden="true"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="1.5"
								d="M12 4v16m8-8H4"
							/>
						</svg>
						<span class="text-sm font-medium text-slate-600 dark:text-neutral-400">Crear Pedido</span>
					</button>
				{:else}
					{#each drafts as draft, index}
						<div class="min-w-[260px] rounded-xl border p-3">
							<button
								type="button"
								class="w-full text-left"
								onclick={() => {
									activeDraftId = draft.id;
								}}
							>
								<p class="text-sm font-semibold">{draftCustomer(draft)?.phone ?? `Pedido ${index + 1}`}</p>
								<p class="mt-1 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
									{draftCustomer(draft)?.address ?? 'Sin cliente seleccionado'}
								</p>
								<div class="mt-2 flex items-center justify-between text-xs">
									<span class="rounded-full bg-slate-100 px-2 py-0.5 dark:bg-slate-800">
										{draft.cart.length} items
									</span>
									<span class="font-semibold">{formatMoney(draftTotal(draft))}</span>
								</div>
							</button>
						</div>
					{/each}
					<button
						type="button"
						class="flex min-h-[100px] min-w-[200px] flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 px-3 py-4 transition-colors hover:border-slate-400 hover:bg-slate-100/50 dark:border-neutral-600 dark:bg-neutral-900/50 dark:hover:border-neutral-500 dark:hover:bg-neutral-800/50"
						onclick={openClientModal}
					>
						<svg class="h-8 w-8 text-slate-400 dark:text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4v16m8-8H4" />
						</svg>
						<span class="text-xs font-medium text-slate-600 dark:text-neutral-400">Crear Pedido</span>
					</button>
				{/if}
			</div>
		</section>

		{#if selectedCustomer}
		<section class="panel p-4">
			<div class="mb-3 flex items-center gap-2">
				<input
					class="input"
					placeholder="Buscar producto por nombre o descripción"
					bind:value={productSearch}
				/>
				<div class="inline-flex rounded-lg border border-slate-300 dark:border-slate-700">
					<button
						type="button"
						class="px-2 py-2"
						class:bg-blue-600={productsViewMode === 'cards'}
						class:text-white={productsViewMode === 'cards'}
						class:text-slate-500={productsViewMode !== 'cards'}
						aria-label="Ver productos en cards"
						title="Ver como cards"
						onclick={() => (productsViewMode = 'cards')}
					>
						<svg viewBox="0 0 20 20" class="h-4 w-4" fill="none">
							<rect x="2.5" y="3" width="6.5" height="6.5" rx="1.2" stroke="currentColor" stroke-width="1.5" />
							<rect x="11" y="3" width="6.5" height="6.5" rx="1.2" stroke="currentColor" stroke-width="1.5" />
							<rect x="2.5" y="10.5" width="6.5" height="6.5" rx="1.2" stroke="currentColor" stroke-width="1.5" />
							<rect x="11" y="10.5" width="6.5" height="6.5" rx="1.2" stroke="currentColor" stroke-width="1.5" />
						</svg>
					</button>
					<button
						type="button"
						class="px-2 py-2"
						class:bg-blue-600={productsViewMode === 'list'}
						class:text-white={productsViewMode === 'list'}
						class:text-slate-500={productsViewMode !== 'list'}
						aria-label="Ver productos en lista"
						title="Ver como lista"
						onclick={() => (productsViewMode = 'list')}
					>
						<svg viewBox="0 0 20 20" class="h-4 w-4" fill="none">
							<path d="M4 5h12M4 10h12M4 15h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
						</svg>
					</button>
				</div>
			</div>
			<div class="mb-3 flex flex-wrap gap-2">
				<button
					class="rounded-full border px-3 py-1 text-xs"
					class:border-blue-500={activeDraft?.categoryId === 'all'}
					class:bg-blue-50={activeDraft?.categoryId === 'all'}
					class:dark:bg-blue-900={activeDraft?.categoryId === 'all'}
					onclick={() => {
						updateActiveDraft((draft) => ({ ...draft, categoryId: 'all' }));
					}}
				>
					Todos
				</button>
				{#each categories as category}
					<button
						class="rounded-full border px-3 py-1 text-xs"
						class:border-blue-500={activeDraft?.categoryId === category.id}
						class:bg-blue-50={activeDraft?.categoryId === category.id}
						class:dark:bg-blue-900={activeDraft?.categoryId === category.id}
						onclick={() => {
							updateActiveDraft((draft) => ({ ...draft, categoryId: category.id }));
						}}
					>
						{category.name}
					</button>
				{/each}
			</div>

			{#if productsViewMode === 'cards'}
				<div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
					{#each products as product}
						{#each findSkusByProduct(product.id) as sku}
							<div class="rounded-xl border border-slate-200 p-2 dark:border-slate-700">
								<div class="flex items-center gap-3">
									<img
										class="h-20 w-20 rounded-lg object-cover"
										src={product.imageUrl ?? `https://placehold.co/96x96?text=${encodeURIComponent(product.name.slice(0, 8))}`}
										alt={product.name}
									/>
									<div class="min-w-0 flex-1">
										<p class="line-clamp-2 text-base font-semibold">{product.name}</p>
										<p class="text-sm text-slate-500 dark:text-slate-400">{sku.label}</p>
										<p class="mt-1 text-2xl font-bold">{formatMoney(sku.price)}</p>
									</div>
									<div class="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1 dark:border-slate-700">
										<button class="btn-secondary !h-7 !w-7 !px-0 !py-0" onclick={() => decSku(sku)}>-</button>
										<span class="w-5 text-center text-sm font-semibold">{qtyBySku(sku.id)}</span>
										<button class="btn-primary !h-7 !w-7 !px-0 !py-0" disabled={configLoading} onclick={() => void openConfig(sku, product)}>{configLoading ? '…' : '+'}</button>
									</div>
								</div>
							</div>
						{/each}
					{/each}
					{#if products.length === 0}
						<p class="text-sm text-slate-500 dark:text-slate-400">No hay productos para esa búsqueda.</p>
					{/if}
				</div>
			{:else}
				<div class="space-y-2">
					{#each products as product}
						{#each findSkusByProduct(product.id) as sku}
							<div class="rounded-xl border border-slate-200 p-2 dark:border-slate-700">
								<div class="flex items-center gap-3">
									<img
										class="h-16 w-16 rounded-lg object-cover"
										src={product.imageUrl ?? `https://placehold.co/80x80?text=${encodeURIComponent(product.name.slice(0, 8))}`}
										alt={product.name}
									/>
									<div class="min-w-0 flex-1">
										<p class="line-clamp-1 text-sm font-semibold">{product.name}</p>
										<p class="text-xs text-slate-500 dark:text-slate-400">{sku.label}</p>
									</div>
									<p class="min-w-24 text-right text-xl font-bold">{formatMoney(sku.price)}</p>
									<div class="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1 dark:border-slate-700">
										<button class="btn-secondary !h-7 !w-7 !px-0 !py-0" onclick={() => decSku(sku)}>-</button>
										<span class="w-5 text-center text-sm font-semibold">{qtyBySku(sku.id)}</span>
										<button class="btn-primary !h-7 !w-7 !px-0 !py-0" disabled={configLoading} onclick={() => void openConfig(sku, product)}>{configLoading ? '…' : '+'}</button>
									</div>
								</div>
							</div>
						{/each}
					{/each}
					{#if products.length === 0}
						<p class="text-sm text-slate-500 dark:text-slate-400">No hay productos para esa búsqueda.</p>
					{/if}
				</div>
			{/if}
		</section>
		{:else if activeDraft}
		<section class="panel p-4">
			<p class="text-center text-sm text-slate-500 dark:text-slate-400">
				Seleccioná un cliente para agregar productos al pedido.
			</p>
			<button
				type="button"
				class="btn-primary mx-auto mt-3 block"
				onclick={() => openClientModal(true)}
			>
				Seleccionar cliente
			</button>
		</section>
		{/if}
	</div>

	{#if selectedCustomer}
	<div class="xl:col-span-4 space-y-4">
		<section class="panel p-4">
			<div class="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
				<p><span class="font-medium">Tel:</span> {selectedCustomer.phone}</p>
				<p><span class="font-medium">Dirección:</span> {selectedCustomer.address}</p>
				<p><span class="font-medium">Entre calles:</span> {selectedCustomer.betweenStreets ?? '-'}</p>
				<p><span class="font-medium">Observación:</span> {selectedCustomer.notes ?? '-'}</p>
			</div>
			<div class="mt-3 flex flex-wrap gap-2">
				<button
					type="button"
					class="btn-secondary flex-1 min-w-0"
					onclick={() => openClientModal(true)}
				>
					Cambiar cliente
				</button>
				<button
					type="button"
					class="btn-secondary flex-1 min-w-0"
					onclick={() => goto(`/app/clients?editId=${encodeURIComponent(selectedCustomer.id)}`)}
				>
					Editar cliente
				</button>
			</div>
		</section>

		<section class="panel p-4">
			<h2 class="mb-3 text-base font-semibold">Resumen del pedido</h2>
			<div class="max-h-72 space-y-2 overflow-auto">
				{#if !activeDraft || activeDraft.cart.length === 0}
					<p class="text-sm text-slate-500 dark:text-slate-400">Sin items</p>
				{/if}
				{#each activeDraft?.cart ?? [] as item}
					<div class="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
						<div class="flex items-center justify-between gap-2">
							<p class="text-sm font-medium">{item.nameSnapshot}</p>
							<p class="text-sm">{formatMoney(item.subtotal)}</p>
						</div>
						<div class="mt-2 flex items-center gap-2">
							<button class="btn-secondary !px-2 !py-1" onclick={() => changeQty(item.id, 'down')}>-</button>
							<span class="min-w-7 text-center text-sm">{item.qty}</span>
							<button class="btn-secondary !px-2 !py-1" onclick={() => changeQty(item.id, 'up')}>+</button>
						</div>
					</div>
				{/each}
			</div>

			<div class="mt-4 space-y-3 border-t border-slate-200 pt-3 dark:border-slate-700">
				<label class="block space-y-1">
					<span class="text-sm font-medium">Paga con</span>
					<select
						class="input"
						value={activeDraft?.paymentMethod ?? 'CASH'}
						onchange={(e) => {
							const value = (e.currentTarget as HTMLSelectElement).value as PaymentMethod;
							updateActiveDraft((draft) => ({ ...draft, paymentMethod: value }));
						}}
					>
						<option value="CASH">CASH</option>
						<option value="MP">MP</option>
						<option value="TRANSFER">TRANSFER</option>
					</select>
				</label>
				{#if activeDraft?.paymentMethod === 'CASH'}
					<label class="block space-y-1">
						<span class="text-sm font-medium">Paga con $</span>
						<input
							class="input"
							type="number"
							min="0"
							value={activeDraft.cashReceived}
							oninput={(e) => {
								const value = Number((e.currentTarget as HTMLInputElement).value);
								updateActiveDraft((draft) => ({ ...draft, cashReceived: value || 0 }));
							}}
						/>
					</label>
					<p class="text-xs text-slate-500">Vuelto: {formatMoney(changeDue)}</p>
				{/if}
				<label class="block space-y-1">
					<span class="text-sm font-medium">Observación del pedido</span>
					<textarea
						class="input min-h-20"
						value={activeDraft?.notes ?? ''}
						oninput={(e) => {
							const value = (e.currentTarget as HTMLTextAreaElement).value;
							updateActiveDraft((draft) => ({ ...draft, notes: value }));
						}}
					></textarea>
				</label>
			</div>

			<div class="mt-4 flex items-center justify-between">
				<p class="text-lg font-semibold">Total: {formatMoney(total)}</p>
				<button class="btn-primary" onclick={confirmOrder} disabled={!canConfirm()}>Confirmar</button>
			</div>
		</section>
	</div>
	{/if}
</div>

<Dialog.Root bind:open={configOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-black/50" />
		<Dialog.Content class="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-4 dark:bg-black">
			<div class="mb-3 flex items-center justify-between">
				<h3 class="text-lg font-semibold">Configurar producto</h3>
				<Dialog.Close class="btn-secondary">Cerrar</Dialog.Close>
			</div>
			{#if configTarget}
				<p class="mb-3 text-sm text-slate-500 dark:text-slate-400">
					{configTarget.product.name} - {configTarget.sku.label}
				</p>
			{/if}

			<div class="max-h-[60vh] space-y-4 overflow-auto">
				{#each configGroups as group}
					<div class="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
						<div class="mb-2 flex items-center justify-between">
							<p class="font-medium">{group.name}</p>
							<p class="text-xs text-slate-500 dark:text-slate-400">
								min {group.min_select} / max {group.max_select}
							</p>
						</div>
						<div class="space-y-2">
							{#each getConfigOptions(group.id) as opt}
								<div class="flex items-center justify-between rounded border border-slate-200 px-2 py-1 text-sm dark:border-slate-700">
									<label class="flex items-center gap-2">
										<input
											type={group.max_select === 1 ? 'radio' : 'checkbox'}
											checked={(selectionsByGroup[group.id] ?? []).includes(opt.id)}
											onchange={() => toggleOption(group, opt.id)}
										/>
										<span>{opt.name}</span>
										<span class="text-xs text-slate-500 dark:text-slate-400">
											{opt.price_delta >= 0 ? '+' : ''}
											{formatMoney(opt.price_delta)}
										</span>
									</label>
									<div class="flex items-center gap-2">
										<span class="text-xs text-slate-500 dark:text-slate-400">Qty</span>
										<input
											class="input !w-16 !py-1 text-xs"
											type="number"
											min="1"
											value={optionQtyById[opt.id] ?? 1}
											oninput={(e) => {
												const next = Number((e.currentTarget as HTMLInputElement).value) || 1;
												optionQtyById = { ...optionQtyById, [opt.id]: Math.max(1, next) };
											}}
										/>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>

			{#if configError}
				<p class="mt-3 text-sm text-rose-600">{configError}</p>
			{/if}
			<div class="mt-4 flex justify-end gap-2">
				<Dialog.Close class="btn-secondary">Cancelar</Dialog.Close>
				<button class="btn-primary" disabled={!canAddConfigured()} onclick={addConfiguredProduct}>
					Agregar
				</button>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<Dialog.Root bind:open={clientModalOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-black/50" />
		<Dialog.Content
			class="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-neutral-700 dark:bg-black"
			aria-describedby="client-modal-desc"
			aria-labelledby="client-modal-title"
		>
			<h2 id="client-modal-title" class="mb-4 text-lg font-semibold">Buscar o agregar cliente</h2>
			{#if addClientMode}
				<div id="client-modal-desc" class="space-y-3">
					<label class="block">
						<span class="mb-1 block text-sm text-slate-600 dark:text-slate-400">Teléfono</span>
						<input
							class="input w-full"
							type="tel"
							inputmode="numeric"
							pattern="[0-9]*"
							placeholder="Solo números"
							value={newClientForm.phone}
							onkeydown={(e) => {
								if (e.key === 'Backspace' || e.key === 'Delete' || e.key === 'Tab' || e.key.startsWith('Arrow') || (e.ctrlKey || e.metaKey) && ['a', 'c', 'v', 'x'].includes(e.key.toLowerCase())) return;
								if (!/^\d$/.test(e.key)) e.preventDefault();
							}}
							oninput={(e) => {
								const v = (e.currentTarget as HTMLInputElement).value.replace(/\D/g, '');
								newClientForm = { ...newClientForm, phone: v };
							}}
						/>
					</label>
					<label class="block">
						<span class="mb-1 block text-sm text-slate-600 dark:text-slate-400">Dirección</span>
						<input class="input w-full" type="text" bind:value={newClientForm.address} placeholder="Calle y número" />
					</label>
					<label class="block">
						<span class="mb-1 block text-sm text-slate-600 dark:text-slate-400">Entre calles (opcional)</span>
						<input class="input w-full" type="text" bind:value={newClientForm.betweenStreets} placeholder="Ej: Av. X y Calle Y" />
					</label>
					<label class="block">
						<span class="mb-1 block text-sm text-slate-600 dark:text-slate-400">Observación (opcional)</span>
						<input class="input w-full" type="text" bind:value={newClientForm.notes} placeholder="Referencias" />
					</label>
					{#if existingCustomerWithPhone}
						<div class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
							<p class="font-medium">Este cliente ya existe</p>
							<p class="mt-1 text-xs opacity-90">
								Tel: {existingCustomerWithPhone.phone} — {existingCustomerWithPhone.address}
							</p>
							<button
								type="button"
								class="btn-primary mt-2 w-full"
								onclick={() => selectClient(existingCustomerWithPhone)}
							>
								Usar este cliente
							</button>
						</div>
					{/if}
					<div class="flex gap-2 pt-2">
						<button type="button" class="btn-secondary flex-1" onclick={() => (addClientMode = false)}>
							Volver
						</button>
						<button
							type="button"
							class="btn-primary flex-1"
							onclick={addNewClient}
							disabled={!!existingCustomerWithPhone}
						>
							Crear y usar
						</button>
					</div>
				</div>
			{:else}
				<div id="client-modal-desc" class="space-y-3">
					<input
						class="input w-full"
						type="search"
						placeholder="Buscar por teléfono o dirección..."
						bind:value={clientSearch}
						aria-label="Buscar cliente"
					/>
					<div class="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-200 dark:border-neutral-700">
						{#each filteredClients as customer}
							<button
								type="button"
								class="w-full rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-slate-100 dark:hover:bg-neutral-800"
								onclick={() => selectClient(customer)}
							>
								<p class="font-medium">{customer.phone}</p>
								<p class="text-xs text-slate-500 dark:text-slate-400">{customer.address}</p>
								{#if customer.betweenStreets?.trim()}
									<p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Entre calles: {customer.betweenStreets.trim()}</p>
								{/if}
								{#if customer.notes?.trim()}
									<p class="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">Obs: {customer.notes.trim()}</p>
								{/if}
							</button>
						{/each}
						{#if filteredClients.length === 0}
							<p class="px-3 py-4 text-center text-sm text-slate-500 dark:text-slate-400">
								Ningún cliente coincide. Agregá uno nuevo.
							</p>
						{/if}
					</div>
					<button type="button" class="btn-secondary w-full" onclick={() => (addClientMode = true)}>
						Agregar cliente nuevo
					</button>
				</div>
			{/if}
			<div class="mt-4 flex justify-end">
				<Dialog.Close class="btn-secondary">Cerrar</Dialog.Close>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
