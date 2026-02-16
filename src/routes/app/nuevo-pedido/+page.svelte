<script lang="ts">
	import { Dialog } from 'bits-ui';
	import {
		computeOrderItemPrice,
		validateSelections,
		type ProductOption as ConfigOption,
		type ProductOptionGroup
	} from '$lib/schema/product-options';
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
	let drafts: OrderDraft[] = [];
	let activeDraftId = '';
	let productSearch = '';
	let productsViewMode: 'cards' | 'list' = 'cards';
	let configOpen = false;
	let configError = '';
	let configTarget: { sku: SKU; product: Product } | null = null;
	let configGroups: ProductOptionGroup[] = [];
	let selectionsByGroup: Record<string, string[]> = {};
	let optionQtyById: Record<string, number> = {};
	const productsOptionsState = fromZustand(productsStore);

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

	$: activeDraft = drafts.find((d) => d.id === activeDraftId) ?? null;
	$: categories = $catalogStore.categories;
	$: products = $catalogStore.products.filter((p) => {
		const selectedCategory = activeDraft?.categoryId ?? 'all';
		if (selectedCategory !== 'all' && p.categoryId !== selectedCategory) return false;
		if (!productSearch.trim()) return true;
		const txt = `${p.name} ${p.description}`.toLowerCase();
		return txt.includes(productSearch.toLowerCase());
	});
	$: selectedCustomer = activeDraft
		? ($customersStore.find((c) => c.id === activeDraft.selectedCustomerId) ?? null)
		: null;
	$: total = activeDraft ? activeDraft.cart.reduce((acc, item) => acc + item.subtotal, 0) : 0;
	$: changeDue =
		activeDraft && activeDraft.paymentMethod === 'CASH' ? Math.max(0, activeDraft.cashReceived - total) : 0;

	const draftCustomer = (draft: OrderDraft) =>
		$customersStore.find((c) => c.id === draft.selectedCustomerId) ?? null;
	const draftTotal = (draft: OrderDraft) => draft.cart.reduce((acc, item) => acc + item.subtotal, 0);
	const qtyBySku = (skuId: string) => activeDraft?.cart.find((item) => item.skuId === skuId)?.qty ?? 0;

	const decSku = (sku: SKU) => {
		if (!activeDraft) return;
		const item = activeDraft.cart.find((i) => i.skuId === sku.id);
		if (!item) return;
		changeQty(item.id, 'down');
	};

	const findSkusByProduct = (productId: string): SKU[] =>
		$catalogStore.skus.filter((sku) => sku.productId === productId);

	const getConfigOptions = (groupId: string): ConfigOption[] =>
		$productsOptionsState.getOptionsByGroup(groupId).filter((option) => option.active);

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

	const openConfig = (sku: SKU, product: Product) => {
		const groups = $productsOptionsState.getGroupsByProduct(product.id);
		if (groups.length === 0) {
			addSku(sku, product);
			return;
		}
		configTarget = { sku, product };
		configGroups = groups;
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
		void Promise.all([customersStore.load(), catalogStore.load(), shiftsStore.loadOpen()]);
		productsStore.getState().hydrate();
		const first = createDraft(draftCount);
		drafts = [first];
		activeDraftId = first.id;
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	});
</script>

<div class="grid grid-cols-1 gap-4 xl:grid-cols-12">
	<div class="xl:col-span-8 space-y-4">
		<section class="panel p-3">
			<p class="mb-2 text-sm font-semibold">Pedidos</p>
			<div class="flex gap-3 overflow-x-auto pb-1">
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
						<label class="mt-2 block">
							<span class="mb-1 block text-xs text-slate-500 dark:text-slate-400">Cliente</span>
							<select
								class="input !py-1 text-xs"
								value={draft.selectedCustomerId ?? ''}
								onchange={(e) => {
									const value = (e.currentTarget as HTMLSelectElement).value;
									updateDraftById(draft.id, (d) => ({ ...d, selectedCustomerId: value || null }));
								}}
							>
								<option value="">Seleccionar cliente</option>
								{#each $customersStore as customer}
									<option value={customer.id}>{customer.phone} - {customer.address}</option>
								{/each}
							</select>
						</label>
					</div>
				{/each}
			</div>
		</section>

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
										<button class="btn-primary !h-7 !w-7 !px-0 !py-0" onclick={() => openConfig(sku, product)}>+</button>
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
										<button class="btn-primary !h-7 !w-7 !px-0 !py-0" onclick={() => openConfig(sku, product)}>+</button>
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
	</div>

	<div class="xl:col-span-4 space-y-4">
		<section class="panel p-4">
			<h2 class="mb-3 text-base font-semibold">Resumen del cliente</h2>
			{#if selectedCustomer}
				<div class="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
					<p><span class="font-medium">Tel:</span> {selectedCustomer.phone}</p>
					<p><span class="font-medium">Dirección:</span> {selectedCustomer.address}</p>
					<p><span class="font-medium">Entre calles:</span> {selectedCustomer.betweenStreets ?? '-'}</p>
					<p><span class="font-medium">Observación:</span> {selectedCustomer.notes ?? '-'}</p>
				</div>
			{:else}
				<p class="text-sm text-slate-500 dark:text-slate-400">
					Seleccioná un cliente en el bloque de pedidos (columna izquierda).
				</p>
			{/if}
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
</div>

<Dialog.Root bind:open={configOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-black/50" />
		<Dialog.Content class="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-4 dark:bg-slate-900">
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
