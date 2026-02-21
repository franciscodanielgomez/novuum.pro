<script lang="ts">
	import { Dialog, DropdownMenu } from 'bits-ui';
	import {
		computeOrderItemPrice,
		validateSelections,
		type ProductOption as ConfigOption,
		type ProductOptionGroup
	} from '$lib/schema/product-options';
	import { customerSchema } from '$lib/schemas';
	import { businessStore } from '$lib/stores/business';
	import { catalogStore } from '$lib/stores/catalog';
	import { customersStore } from '$lib/stores/customers';
	import { ordersStore } from '$lib/stores/orders';
	import { productsStore } from '$lib/stores/productsStore';
	import { sessionStore } from '$lib/stores/session';
	import { shiftsStore } from '$lib/stores/shifts';
	import { toastsStore } from '$lib/stores/toasts';
	import { fromZustand } from '$lib/stores/zustandBridge';
	import { api } from '$lib/api';
	import { refreshTrigger } from '$lib/stores/refreshTrigger';
	import { printTicket } from '$lib/printing/printer';
	import { orderToTicketText } from '$lib/printing/ticket-layout';
	import type { Customer, Order, OrderDraft, OrderItem, PaymentMethod, Product, SKU } from '$lib/types';
	import { generateId, formatMoney } from '$lib/utils';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { tick } from 'svelte';
	import { onMount } from 'svelte';
	import {
		createOrderDraftsStore as draftsStore,
		DRAFTS_STORAGE_KEY,
		getInitialDraftsFromStorage
	} from '$lib/stores/createOrderDrafts';

	let draftCount = $state(1);
	let activeDraftId = $state('');
	/** Lista para el template: se actualiza en el acto tras addDraft/addNewDraft y por suscripción al store */
	let draftsList = $state<OrderDraft[]>([]);

	$effect(() => {
		const unsub = draftsStore.subscribe((v) => {
			draftsList = v;
		});
		return unsub;
	});

	function persistDrafts() {
		if (typeof sessionStorage === 'undefined') return;
		try {
			sessionStorage.setItem(
				DRAFTS_STORAGE_KEY,
				JSON.stringify({ drafts: draftsStore.current, activeDraftId, draftCount })
			);
		} catch {
			// ignore
		}
	}

	let productSearch = $state('');
	let productsViewMode = $state<'cards' | 'list'>('cards');
	let clientModalOpen = $state(false);
	let clientCardMenuOpen = $state(false);
	/** true = cambiar cliente del draft actual; false = crear nuevo draft con el cliente */
	let clientModalForChange = $state(false);
	/** true = acabo de elegir cliente, guardando y mostrando la nueva card antes de cerrar */
	let clientModalSaving = $state(false);
	let clientSearch = $state('');
	let addClientMode = $state(false);
	let newClientForm = $state({ phone: '', address: '', betweenStreets: '', notes: '' });
	let configOpen = $state(false);
	let configLoading = $state(false);
	let configLoadController: AbortController | null = null;
	let configError = $state('');
	let configTarget: { sku: SKU; product: Product } | null = null;
	let configGroups: ProductOptionGroup[] = [];
	/** Opciones por grupo cuando se cargan desde Supabase (product_group_items) */
	let supabaseOptionsByGroup = $state<Record<string, ConfigOption[]>>({});
	/** Nombre de categoría por id de ítem (para mostrar debajo del nombre en el modal) */
	let configOptionCategoryName = $state<Record<string, string>>({});
	let selectionsByGroup = $state<Record<string, string[]>>({});
	let optionQtyById = $state<Record<string, number>>({});
	/** ID del draft cuyo menú de tres puntos está abierto */
	let draftMenuOpenId = $state<string | null>(null);
	/** ID del draft a eliminar (muestra modal de confirmación) */
	let deleteDraftConfirmId = $state<string | null>(null);
	const productsOptionsState = fromZustand(productsStore);

	const isAbortError = (e: unknown): boolean =>
		e instanceof Error
			? e.name === 'AbortError' || /abort/i.test(e.message)
			: false;

	$effect(() => {
		if (configOpen) return;
		if (configLoadController) {
			configLoadController.abort();
			configLoadController = null;
		}
		configLoading = false;
	});

	/** Métodos de pago desde la BD (Configuraciones); para selector y solo Efectivo muestra Paga con / Vuelto */
	type PaymentMethodRow = { id: string; name: string; sort_order: number; active: boolean };
	let paymentMethods = $state<PaymentMethodRow[]>([]);

	function isCashPayment(method: string | undefined): boolean {
		if (!method) return false;
		return method.toUpperCase() === 'EFECTIVO' || method === 'CASH';
	}

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
	let catalogLoading = $state(true);
	let catalogError = $state('');
	let catalogLoadAttempted = $state(false);
	const loadSupabaseCatalog = async (showLoading = true) => {
		if (showLoading && !catalogLoadAttempted) {
			catalogLoadAttempted = true;
			catalogLoading = true;
			catalogError = '';
		}
		try {
			const [cats, prods] = await Promise.all([api.categories.list(), api.products.list()]);
			supabaseCategories = (cats ?? [])
				.filter((c) => c.active)
				.map((c) => ({ id: c.id, name: c.name, sort_order: c.sort_order })) as SupabaseCategory[];
			supabaseProductsRaw = (prods ?? [])
				.filter((p) => p.active)
				.map((p) => ({
					id: p.id,
					name: p.name,
					description: p.description,
					price: p.price,
					image_url: p.image_url ?? null,
					product_categories: (p.product_categories ?? []).map((pc) => ({ category_id: pc.category_id }))
				})) as SupabaseProductRow[];
			catalogError = '';
		} catch (e) {
			const msg =
				e instanceof Error && e.message
					? e.message
					: 'No se pudo cargar el catálogo desde Supabase';
			catalogError = msg;
			toastsStore.error(msg);
		} finally {
			catalogLoading = false;
		}
	};

	async function loadPaymentMethods() {
		try {
			const data = await api.paymentMethods.listActive();
			paymentMethods = (data ?? []).map((r) => ({
				id: r.id,
				name: r.name,
				sort_order: r.sort_order ?? 0,
				active: r.active ?? true
			}));
		} catch (e) {
			const msg =
				e instanceof Error && e.message
					? e.message
					: 'No se pudieron cargar los métodos de pago';
			toastsStore.error(msg);
		}
	}
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
		paymentMethod: paymentMethods[0]?.name ?? 'Efectivo',
		cashReceived: 0,
		deliveryCost: 0,
		notes: '',
		createdAt: new Date().toISOString()
	});

	/** Convierte un pedido BORRADOR del repo en draft para las cards del POS */
	function orderToDraft(order: Order, index: number): OrderDraft {
		const itemsSubtotal = (order.items ?? []).reduce((acc, item) => acc + item.subtotal, 0);
		const deliveryCost =
			order.deliveryCost != null && order.deliveryCost >= 0
				? order.deliveryCost
				: Math.max(0, (order.total ?? 0) - itemsSubtotal);
		return {
			id: order.id,
			title: `Pedido ${index + 1}`,
			selectedCustomerId: order.customerId || null,
			categoryId: 'all',
			cart: order.items ?? [],
			paymentMethod: order.paymentMethod ?? 'Efectivo',
			cashReceived: order.cashReceived ?? 0,
			deliveryCost,
			notes: order.notes ?? '',
			createdAt: order.createdAt,
			customerPhoneSnapshot: order.customerPhoneSnapshot,
			addressSnapshot: order.addressSnapshot,
			betweenStreetsSnapshot: order.betweenStreetsSnapshot,
			orderId: order.id
		};
	}

	const updateActiveDraft = (updater: (draft: OrderDraft) => OrderDraft) => {
		draftsStore.update((drafts) =>
			drafts.map((draft) => (draft.id === activeDraftId ? updater(draft) : draft))
		);
	};

	const updateDraftById = (id: string, updater: (draft: OrderDraft) => OrderDraft) => {
		draftsStore.update((drafts) =>
			drafts.map((draft) => (draft.id === id ? updater(draft) : draft))
		);
	};

	const removeDraft = async (draftId: string) => {
		const draft = draftsStore.current.find((d) => d.id === draftId);
		if (draft?.orderId) {
			await ordersStore.updateStatus(draft.orderId, 'CANCELADO');
		}
		draftsStore.update((drafts) => {
			const idx = drafts.findIndex((d) => d.id === draftId);
			if (idx === -1) return drafts;
			const next = drafts.filter((d) => d.id !== draftId);
			if (activeDraftId === draftId) {
				if (next.length > 0) {
					activeDraftId = next[Math.min(idx, next.length - 1)].id;
				} else {
					activeDraftId = '';
				}
			}
			draftMenuOpenId = null;
			deleteDraftConfirmId = null;
			return next;
		});
	};

	const activeDraft = $derived(
		draftsList.find((d) => d.id === activeDraftId) ?? null
	);
	// Solo mostramos catálogo desde Supabase; sin fallback a catalogStore para no mostrar datos que no son de la base
	const categories = $derived(
		useSupabaseCatalog
			? supabaseCategories.map((c) => ({ id: c.id, name: c.name, sort: c.sort_order })).sort((a, b) => a.sort - b.sort)
			: []
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
			: []
	);
	const selectedCustomer = $derived(
		activeDraft ? ($customersStore.find((c) => c.id === activeDraft.selectedCustomerId) ?? null) : null
	);
	const subtotal = $derived(activeDraft ? activeDraft.cart.reduce((acc, item) => acc + item.subtotal, 0) : 0);
	const deliveryCost = $derived(activeDraft?.deliveryCost ?? 0);
	const total = $derived(subtotal + deliveryCost);
	const changeDue = $derived(
		activeDraft && isCashPayment(activeDraft.paymentMethod) ? Math.max(0, activeDraft.cashReceived - total) : 0
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

	/** Agregar un nuevo borrador (sin cliente) para tener varios pedidos en paralelo */
	const addNewDraft = () => {
		draftCount += 1;
		const newDraft = createDraft(draftCount);
		draftsStore.addDraft(newDraft);
		draftsList = draftsStore.current.slice();
		activeDraftId = newDraft.id;
	};

	const openClientModal = (forChange = false) => {
		clientSearch = '';
		addClientMode = false;
		clientModalForChange = forChange;
		newClientForm = { phone: '', address: '', betweenStreets: '', notes: '' };
		clientModalOpen = true;
	};

	const selectClient = async (customer: Customer) => {
		if (clientModalForChange && activeDraft) {
			const updater = (draft: OrderDraft) => ({
				...draft,
				selectedCustomerId: customer.id,
				customerPhoneSnapshot: customer.phone,
				addressSnapshot: customer.address,
				betweenStreetsSnapshot: customer.betweenStreets
			});
			updateActiveDraft(updater);
			if (activeDraft.orderId) {
				await ordersStore.update(activeDraft.orderId, {
					customerId: customer.id,
					customerPhoneSnapshot: customer.phone,
					addressSnapshot: customer.address,
					betweenStreetsSnapshot: customer.betweenStreets
				});
			}
			clientModalOpen = false;
			clientModalForChange = false;
			return;
		}
		clientModalSaving = true;
		try {
			draftCount += 1;
			const newDraft = createDraft(draftCount);
			const newDraftWithClient: OrderDraft = {
				...newDraft,
				selectedCustomerId: customer.id,
				customerPhoneSnapshot: customer.phone,
				addressSnapshot: customer.address,
				betweenStreetsSnapshot: customer.betweenStreets
			};
			draftsStore.addDraft(newDraftWithClient);
			draftsList = draftsStore.current.slice();
			activeDraftId = newDraft.id;
			if (typeof sessionStorage !== 'undefined') {
				try {
					const list = draftsStore.current;
					sessionStorage.setItem(
						DRAFTS_STORAGE_KEY,
						JSON.stringify({ drafts: list, activeDraftId: newDraft.id, draftCount })
					);
				} catch {
					// ignore
				}
			}
			await tick();
			await new Promise((r) => setTimeout(r, 150));
			await tick();
			clientModalOpen = false;
			// Crear pedido BORRADOR en el repo en segundo plano y asignar orderId al draft
			void (async () => {
				try {
					const created = await ordersStore.create({
						customerId: customer.id,
						customerPhoneSnapshot: customer.phone,
						addressSnapshot: customer.address,
						betweenStreetsSnapshot: customer.betweenStreets,
						status: 'BORRADOR',
						paymentMethod: newDraft.paymentMethod,
						total: 0,
						items: [],
						createdByUserId: $sessionStore.user?.id,
						cashierNameSnapshot: $sessionStore.user?.name,
						shiftId: $sessionStore.shift?.id
					});
					draftsStore.update((prev) =>
						prev.map((d) => (d.id === newDraft.id ? { ...d, orderId: created.id } : d))
					);
				} catch {
					toastsStore.error('No se pudo crear el pedido en borrador');
				}
			})();
		} finally {
			clientModalSaving = false;
		}
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
			: [];

	const getConfigOptions = (groupId: string): ConfigOption[] => {
		const raw =
			supabaseOptionsByGroup[groupId]?.length
				? supabaseOptionsByGroup[groupId].filter((o) => o.active)
				: $productsOptionsState.getOptionsByGroup(groupId).filter((option) => option.active);
		return [...raw].sort((a, b) => {
			const catA = (configOptionCategoryName[a.id] ?? '').toLowerCase();
			const catB = (configOptionCategoryName[b.id] ?? '').toLowerCase();
			if (catA !== catB) return catA.localeCompare(catB);
			return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
		});
	};

	/** Colores por categoría (mismo nombre = mismo color) para agrupar visualmente */
	const CATEGORY_CHIP_CLASSES = [
		'bg-amber-500/90 text-white',
		'bg-emerald-600/90 text-white',
		'bg-sky-600/90 text-white',
		'bg-violet-600/90 text-white',
		'bg-rose-500/90 text-white',
		'bg-orange-500/90 text-white',
		'bg-teal-600/90 text-white',
		'bg-indigo-600/90 text-white',
		'bg-fuchsia-600/90 text-white',
		'bg-cyan-600/90 text-white'
	] as const;
	const getCategoryChipClass = (categoryName: string): string => {
		let h = 0;
		for (let i = 0; i < categoryName.length; i++) h = (h << 5) - h + categoryName.charCodeAt(i);
		const idx = Math.abs(h) % CATEGORY_CHIP_CLASSES.length;
		return CATEGORY_CHIP_CLASSES[idx];
	};

	const configSelectedNamesList = $derived.by(() =>
		configGroups.flatMap((g) => {
			const ids = selectionsByGroup[g.id] ?? [];
			const opts = getConfigOptions(g.id);
			return ids.map((id) => opts.find((o) => o.id === id)?.name).filter((n): n is string => Boolean(n));
		})
	);

	const totalQtyForGroup = (groupId: string) =>
		(selectionsByGroup[groupId] ?? []).reduce(
			(sum, id) => sum + Math.max(1, optionQtyById[id] ?? 1),
			0
		);

	const toggleOption = (group: ProductOptionGroup, optionId: string) => {
		configError = '';
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
		if (current.length >= group.max_select) {
			configError = `Máximo ${group.max_select} en ${group.name}. Quitá uno antes de agregar otro.`;
			return;
		}
		const total = totalQtyForGroup(group.id);
		if (total >= group.max_select) {
			configError = `Ya llegaste al máximo (${group.max_select}) en ${group.name}.`;
			return;
		}
		selectionsByGroup = { ...selectionsByGroup, [group.id]: [...current, optionId] };
	};

	const openConfig = async (sku: SKU, product: Product) => {
		if (useSupabaseCatalog) {
			if (configLoadController) configLoadController.abort();
			const controller = new AbortController();
			configLoadController = controller;
			configLoading = true;
			configError = '';
			try {
				const assignments = await api.products.listAssignments(product.id, controller.signal);
				if (!assignments?.length) {
					addSku(sku, product);
					return;
				}
				const groupIds = assignments.map((a) => a.group_id);
				const [groupsRes, itemsRes] = await Promise.all([
					api.groups.listByIds(groupIds, controller.signal),
					api.groups.listItemsByGroupIds(groupIds, controller.signal)
				]);
				const groupsData = (groupsRes ?? []) as { id: string; name: string; sort_order: number }[];
				const itemsData = (itemsRes ?? []) as { id: string; group_id: string; parent_id: string | null; name: string; sort_order: number; active: boolean; image_url?: string | null }[];
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
				const categoryNameById: Record<string, string> = {};
				for (const item of itemsData) {
					if (item.parent_id == null) categoryNameById[item.id] = item.name;
				}
				const optionsByGroup: Record<string, ConfigOption[]> = {};
				const optionCategoryName: Record<string, string> = {};
				for (const item of itemsData) {
					if (!item.active || item.parent_id == null) continue;
					const opt: ConfigOption = {
						id: item.id,
						group_id: item.group_id,
						name: item.name,
						price_delta: 0,
						active: true,
						sort_order: item.sort_order ?? 0,
						image_url: item.image_url ?? undefined,
						created_at: now,
						updated_at: now
					};
					if (!optionsByGroup[item.group_id]) optionsByGroup[item.group_id] = [];
					optionsByGroup[item.group_id].push(opt);
					const catName = categoryNameById[item.parent_id];
					if (catName) optionCategoryName[item.id] = catName;
				}
				configTarget = { sku, product };
				configGroups = groups;
				supabaseOptionsByGroup = optionsByGroup;
				configOptionCategoryName = optionCategoryName;
				selectionsByGroup = Object.fromEntries(groups.map((g) => [g.id, []]));
				optionQtyById = {};
				configOpen = true;
			} catch (e) {
				if (isAbortError(e)) return;
				configError =
					e instanceof Error && e.message ? e.message : 'No se pudo cargar la configuración del producto';
				toastsStore.error(configError);
			} finally {
				configLoading = false;
				if (configLoadController === controller) configLoadController = null;
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
		configOptionCategoryName = {};
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

	const canConfirm = () => {
		if (!activeDraft || !selectedCustomer || activeDraft.cart.length === 0) return false;
		if (isCashPayment(activeDraft.paymentMethod)) {
			return (activeDraft.cashReceived ?? 0) >= total;
		}
		return true;
	};

	const confirmOrder = async () => {
		if (!activeDraft || !canConfirm()) {
			toastsStore.error('Seleccioná cliente y al menos un item');
			return;
		}
		try {
			await shiftsStore.loadOpen();
			const payload = {
				customerId: selectedCustomer!.id,
				customerPhoneSnapshot: selectedCustomer!.phone,
				addressSnapshot: selectedCustomer!.address,
				betweenStreetsSnapshot: selectedCustomer!.betweenStreets,
				status: 'NO_ASIGNADO' as const,
				paymentMethod: activeDraft.paymentMethod,
				cashReceived: isCashPayment(activeDraft.paymentMethod) ? activeDraft.cashReceived : undefined,
				changeDue: isCashPayment(activeDraft.paymentMethod) ? changeDue : undefined,
				notes: activeDraft.notes,
				deliveryCost: activeDraft.deliveryCost ?? 0,
				total,
				createdByUserId: $sessionStore.user?.id,
				cashierNameSnapshot: $sessionStore.user?.name,
				shiftId: $sessionStore.shift?.id,
				items: activeDraft.cart
			};
			let orderToPrint: Order | null = null;
			if (activeDraft.orderId) {
				await ordersStore.update(activeDraft.orderId, payload);
				toastsStore.success('Pedido confirmado');
				orderToPrint = await api.orders.get(activeDraft.orderId);
			} else {
				const created = await ordersStore.create(payload);
				toastsStore.success(`Pedido #${created.orderNumber} creado`);
				orderToPrint = created;
			}
			if (orderToPrint) {
				try {
					const cadeteName = '-';
					const textOriginal = orderToTicketText(orderToPrint, cadeteName, 'original');
					const textCopia = orderToTicketText(orderToPrint, cadeteName, 'copia');
					await printTicket(textOriginal);
					await printTicket(textCopia);
					toastsStore.success('Ticket enviado a impresora');
				} catch (e) {
					toastsStore.error(e instanceof Error ? e.message : 'Error al imprimir');
				}
			}
			const confirmedId = activeDraftId;
			const currentIndex = draftsStore.current.findIndex((d) => d.id === confirmedId);
			draftsStore.update((prev) => prev.filter((d) => d.id !== confirmedId));
			const remaining = draftsStore.current;
			if (remaining.length > 0) {
				const nextIndex = Math.min(currentIndex, remaining.length - 1);
				activeDraftId = remaining[nextIndex].id;
			} else {
				activeDraftId = '';
			}
			draftsList = draftsStore.current.slice();
			await ordersStore.load();
		} catch (err) {
			const message = err instanceof Error ? err.message : 'No se pudo confirmar el pedido';
			toastsStore.error(message);
		}
	};

	const onKeyDown = (e: KeyboardEvent) => {
		if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || document.activeElement?.tagName !== 'TEXTAREA')) {
			e.preventDefault();
			void confirmOrder();
		}
	};

	// Reaccionar a openClientModal=1 en la URL (ej. clic en "+" del header): abrir modal y limpiar URL
	$effect(() => {
		const openFromUrl = $page.url.searchParams.get('openClientModal') === '1';
		if (openFromUrl) {
			openClientModal(false);
			goto('/app/create_order', { replaceState: true });
		}
	});

	$effect(() => {
		void draftsList;
		void activeDraftId;
		void draftCount;
		persistDrafts();
	});

	// Sincronizar borrador activo con el pedido BORRADOR en el repo (items, total, pago, notas)
	$effect(() => {
		const d = activeDraft;
		if (!d?.orderId) return;
		const subtotalD = d.cart.reduce((acc, item) => acc + item.subtotal, 0);
		const totalD = subtotalD + (d.deliveryCost ?? 0);
		void ordersStore.update(d.orderId, {
			items: d.cart,
			total: totalD,
			deliveryCost: d.deliveryCost ?? 0,
			paymentMethod: d.paymentMethod,
			notes: d.notes,
			cashReceived: isCashPayment(d.paymentMethod) ? d.cashReceived : undefined
		});
	});

	// Cerrar menú de tres puntos al hacer clic fuera (no en el trigger ni en el contenido del menú)
	$effect(() => {
		const openId = draftMenuOpenId;
		if (!openId) return;
		const handler = (e: MouseEvent) => {
			const target = e.target instanceof Element ? e.target : null;
			if (!target) return;
			if (target.closest('[data-draft-menu-trigger]')) return;
			if (target.closest('[data-draft-menu-content]')) return;
			draftMenuOpenId = null;
		};
		const t = setTimeout(() => {
			document.addEventListener('pointerdown', handler);
		}, 0);
		return () => {
			clearTimeout(t);
			document.removeEventListener('pointerdown', handler);
		};
	});

	onMount(() => {
		const current = draftsStore.current;
		const skipRestore = !!$page.url.searchParams.get('customerId');
		if (current.length === 0) {
			const initial = getInitialDraftsFromStorage(skipRestore);
			draftsStore.set(initial.drafts);
			draftsList = initial.drafts.slice();
			draftCount = initial.draftCount;
			activeDraftId = initial.activeDraftId;
		} else {
			draftsList = current.slice();
			const fromStorage = getInitialDraftsFromStorage(skipRestore);
			if (fromStorage.drafts.length > 0 && fromStorage.activeDraftId) {
				const stillExists = current.some((d) => d.id === fromStorage.activeDraftId);
				activeDraftId = stillExists ? fromStorage.activeDraftId : current[0].id;
			} else {
				activeDraftId = current[0]?.id ?? '';
			}
			draftCount = Math.max(draftCount, current.length);
		}

		const customerIdFromUrl = $page.url.searchParams.get('customerId');
		const draftIdFromUrl = $page.url.searchParams.get('draftId');
		const openClientModalFromUrl = $page.url.searchParams.get('openClientModal') === '1';
		void (async () => {
			await Promise.all([
				customersStore.load(),
				catalogStore.load(),
				shiftsStore.loadOpen(),
				ordersStore.load(),
				businessStore.load()
			]);
			await loadSupabaseCatalog();
			await loadPaymentMethods();
			// Si no hay drafts (p. ej. entró directo al POS), cargar pedidos BORRADOR del repo como cards
			if (draftsStore.current.length === 0 && !customerIdFromUrl) {
				const allOrders = await api.orders.list();
				const borradorOrders = allOrders.filter((o: Order) => o.status === 'BORRADOR');
				if (borradorOrders.length > 0) {
					const drafts = borradorOrders.map((o: Order, i: number) => orderToDraft(o, i));
					draftsStore.set(drafts);
					draftsList = drafts.slice();
					activeDraftId = drafts[0].id;
					draftCount = drafts.length;
				}
			}
			if (customerIdFromUrl) {
				const customer = $customersStore.find((c) => c.id === customerIdFromUrl);
				if (customer) {
					draftCount += 1;
					const newDraft = createDraft(draftCount);
					const withClient = {
						...newDraft,
						paymentMethod: paymentMethods[0]?.name ?? 'Efectivo',
						selectedCustomerId: customer.id,
						customerPhoneSnapshot: customer.phone,
						addressSnapshot: customer.address,
						betweenStreetsSnapshot: customer.betweenStreets
					};
					try {
						const created = await ordersStore.create({
							customerId: customer.id,
							customerPhoneSnapshot: customer.phone,
							addressSnapshot: customer.address,
							betweenStreetsSnapshot: customer.betweenStreets,
							status: 'BORRADOR',
							paymentMethod: paymentMethods[0]?.name ?? 'Efectivo',
							total: 0,
							items: [],
							createdByUserId: $sessionStore.user?.id,
							cashierNameSnapshot: $sessionStore.user?.name,
							shiftId: $sessionStore.shift?.id
						});
						(withClient as OrderDraft).orderId = created.id;
					} catch {
						// sigue con el borrador local sin orderId
					}
					draftsStore.set([withClient]);
					activeDraftId = newDraft.id;
					await goto('/app/create_order', { replaceState: true });
				}
			} else if (draftIdFromUrl) {
				const current = draftsStore.current;
				const match = current.find(
					(d) => d.id === draftIdFromUrl || d.orderId === draftIdFromUrl
				);
				if (match) {
					activeDraftId = match.id;
					draftsList = draftsStore.current.slice();
				} else {
					// Cargar el pedido desde la API (ej. llegó por "Continuar" desde lista de pedidos)
					const order = await api.orders.get(draftIdFromUrl);
					if (order && order.status === 'BORRADOR') {
						const draft = orderToDraft(order, current.length);
						draftsStore.update((prev) => [...prev, draft]);
						draftsList = draftsStore.current.slice();
						activeDraftId = draft.id;
					} else {
						toastsStore.error('Pedido no encontrado o no es un borrador');
					}
				}
				await goto('/app/create_order', { replaceState: true });
			} else if (openClientModalFromUrl) {
				openClientModal(false);
				await goto('/app/create_order', { replaceState: true });
			}
		})();
		productsStore.getState().hydrate();
		// Al volver de inactividad (visibility/focus o cada 2 min), el layout dispara refreshTrigger; recargamos catálogo y métodos de pago
		let firstRefresh = true;
		const refreshUnsub = refreshTrigger.subscribe(() => {
			if (firstRefresh) {
				firstRefresh = false;
				return;
			}
			void loadSupabaseCatalog(false);
			void loadPaymentMethods();
		});
		window.addEventListener('keydown', onKeyDown);
		return () => {
			refreshUnsub();
			window.removeEventListener('keydown', onKeyDown);
		};
	});
</script>

<!-- En xl la columna derecha es fixed para quedar siempre alineada arriba -->
<div class="grid grid-cols-1 gap-4 xl:grid-cols-12 xl:pr-[25rem] xl:items-start">
	<div class="xl:col-span-12 space-y-4">
		<section class="panel p-3">
			<div class="flex gap-3 overflow-x-auto pb-1 scroll-smooth" role="region" aria-label="Carousel de pedidos">
				{#if draftsList.length === 0}
					<button
						type="button"
						class="flex min-h-[72px] min-w-[150px] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 px-2 py-2.5 transition-colors hover:border-slate-400 hover:bg-slate-100/50 dark:border-neutral-600 dark:bg-neutral-900/50 dark:hover:border-neutral-500 dark:hover:bg-neutral-800/50"
						onclick={() => openClientModal(false)}
					>
						<svg
							class="h-6 w-6 text-slate-400 dark:text-neutral-500"
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
						<span class="text-xs font-medium text-slate-600 dark:text-neutral-400">Crear Pedido</span>
					</button>
				{:else}
					{#each draftsList as draft, index}
						{@const isActive = activeDraftId === draft.id}
						<div
							class="relative flex min-w-[150px] flex-col rounded-xl border p-2 transition-colors {isActive
								? 'border-neutral-800 bg-neutral-900 text-white dark:border-slate-400 dark:bg-slate-100 dark:text-slate-900'
								: 'border-slate-200 dark:border-neutral-600'}"
						>
							<DropdownMenu.Root
								open={draftMenuOpenId === draft.id}
								onOpenChange={(open) => {
									draftMenuOpenId = open ? draft.id : null;
								}}
							>
								<DropdownMenu.Trigger
									data-draft-menu-trigger
									class="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-lg transition-colors {isActive
										? 'text-slate-300 hover:bg-white/20 hover:text-white dark:text-slate-600 dark:hover:bg-slate-800/30 dark:hover:text-slate-900'
										: 'text-slate-400 hover:bg-slate-200/80 hover:text-slate-600 dark:hover:bg-neutral-700 dark:hover:text-neutral-200'}"
									aria-label="Opciones del pedido"
									title="Opciones"
									onclick={(e) => e.stopPropagation()}
								>
									<svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
										<circle cx="12" cy="6" r="1.5" />
										<circle cx="12" cy="12" r="1.5" />
										<circle cx="12" cy="18" r="1.5" />
									</svg>
								</DropdownMenu.Trigger>
								<DropdownMenu.Portal>
									<DropdownMenu.Content
										side="left"
										align="start"
										sideOffset={4}
										interactOutsideBehavior="ignore"
										data-draft-menu-content
										class="min-w-[120px] rounded-lg border border-slate-200 bg-white py-1.5 shadow-lg dark:border-neutral-700 dark:bg-neutral-800"
									>
										<DropdownMenu.Item
											class="flex cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-rose-600 outline-none hover:bg-slate-100 dark:hover:bg-neutral-700 dark:text-rose-400"
											onSelect={() => {
												deleteDraftConfirmId = draft.id;
											}}
										>
											<svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
												<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
												<path d="M10 11v6M14 11v6" />
											</svg>
											Eliminar
										</DropdownMenu.Item>
									</DropdownMenu.Content>
								</DropdownMenu.Portal>
							</DropdownMenu.Root>
							<button
								type="button"
								class="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
								onclick={() => {
									draftMenuOpenId = null;
									activeDraftId = draft.id;
								}}
							>
								<div class="min-w-0 flex-1 pr-6">
									<p class="truncate text-sm font-semibold {isActive ? 'text-white dark:text-slate-900' : ''}">{draftCustomer(draft)?.phone ?? '—'}</p>
									<p class="mt-0.5 line-clamp-2 text-xs leading-tight {isActive ? 'text-slate-300 dark:text-slate-600' : 'text-slate-500 dark:text-slate-400'}">
										{draftCustomer(draft)?.address ?? 'Sin dirección'}
									</p>
								</div>
								<div class="mt-0.5 flex w-full items-center justify-end">
									<span class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium {isActive
										? 'bg-white/20 text-white dark:bg-slate-800/40 dark:text-slate-900'
										: 'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200'}">
										Borrador
									</span>
								</div>
							</button>
						</div>
					{/each}
					<button
						type="button"
						class="flex min-h-[72px] min-w-[150px] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 px-2 py-2.5 transition-colors hover:border-slate-400 hover:bg-slate-100/50 dark:border-neutral-600 dark:bg-neutral-900/50 dark:hover:border-neutral-500 dark:hover:bg-neutral-800/50"
						onclick={() => openClientModal(false)}
					>
						<svg class="h-6 w-6 text-slate-400 dark:text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4v16m8-8H4" />
						</svg>
						<span class="text-xs font-medium text-slate-600 dark:text-neutral-400">Crear Pedido</span>
					</button>
				{/if}
			</div>
		</section>

		{#if selectedCustomer}
		<section class="panel p-4">
			{#if catalogLoading}
				<p class="py-8 text-center text-sm text-slate-500 dark:text-slate-400">Cargando catálogo…</p>
			{:else if catalogError && !useSupabaseCatalog}
				<div class="py-8 text-center">
					<p class="text-sm text-red-600 dark:text-red-400">{catalogError}</p>
					<button
						type="button"
						class="btn-primary mt-3"
						onclick={() => void loadSupabaseCatalog(true)}
					>
						Reintentar
					</button>
				</div>
			{:else}
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
				<div class="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(10rem,1fr))]">
					{#each products as product}
						{#each findSkusByProduct(product.id) as sku}
							<div class="relative aspect-square w-full overflow-hidden rounded-2xl border border-slate-200 shadow-sm dark:border-slate-600">
								<img
									class="absolute inset-0 h-full w-full object-cover"
									src={product.imageUrl ?? `https://placehold.co/400x533?text=${encodeURIComponent(product.name.slice(0, 12))}`}
									alt={product.name}
								/>
								<!-- Degradado + título, precio y selector sobre la imagen -->
								<div class="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 px-3 pb-3 pt-10 bg-gradient-to-t from-black/90 via-black/50 to-transparent">
									<p class="line-clamp-2 text-xs font-bold uppercase tracking-wide text-white drop-shadow-sm">
										{product.name}
									</p>
									<div class="flex min-w-0 items-center justify-between gap-2">
										<span class="min-w-0 truncate text-sm font-semibold text-white drop-shadow-sm">{formatMoney(sku.price)}</span>
										<div class="shrink-0 inline-flex overflow-hidden rounded-lg border border-white/30 bg-white/20 backdrop-blur-sm">
											<button
												type="button"
												class="flex h-7 w-6 shrink-0 items-center justify-center text-white transition-opacity hover:bg-white/20"
												aria-label="Restar"
												onclick={() => decSku(sku)}
											>
												<span class="text-sm font-medium leading-none">−</span>
											</button>
											<span class="flex min-w-[1.5rem] items-center justify-center border-x border-white/30 px-0.5 text-xs font-bold text-white">
												{qtyBySku(sku.id)}
											</span>
											<button
												type="button"
												class="flex h-7 w-6 shrink-0 items-center justify-center text-white transition-opacity hover:bg-white/20 disabled:opacity-50"
												aria-label="Sumar"
												disabled={configLoading}
												onclick={() => void openConfig(sku, product)}
											>
												<span class="text-sm font-medium leading-none">+</span>
											</button>
										</div>
									</div>
								</div>
							</div>
						{/each}
					{/each}
					{#if products.length === 0}
						<p class="col-span-full text-sm text-slate-500 dark:text-slate-400">No hay productos para esa búsqueda.</p>
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

	<!-- Columna derecha fija: misma altura que el inicio del contenido (header 3.5rem + main padding 1.5rem = 5rem) -->
	<div class="xl:fixed xl:right-6 xl:top-20 xl:z-10 xl:w-96 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto xl:shadow-lg xl:rounded-xl">
		{#if selectedCustomer}
		<section class="panel relative p-3">
			<button
				type="button"
				class="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-neutral-700 dark:hover:text-neutral-300"
				aria-label="Opciones del cliente"
				aria-expanded={clientCardMenuOpen}
				onclick={() => (clientCardMenuOpen = !clientCardMenuOpen)}
			>
				<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
					<circle cx="12" cy="6" r="1.5" />
					<circle cx="12" cy="12" r="1.5" />
					<circle cx="12" cy="18" r="1.5" />
				</svg>
			</button>
			{#if clientCardMenuOpen}
				<button
					type="button"
					class="fixed inset-0 z-10 cursor-default"
					aria-label="Cerrar menú"
					onclick={() => (clientCardMenuOpen = false)}
				></button>
				<div
					class="absolute right-3 top-12 z-20 min-w-[180px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-800"
					role="menu"
				>
					<button
						type="button"
						class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-neutral-700"
						role="menuitem"
						onclick={() => {
							clientCardMenuOpen = false;
							openClientModal(true);
						}}
					>
						Cambiar cliente
					</button>
					<button
						type="button"
						class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-neutral-700"
						role="menuitem"
						onclick={() => {
							clientCardMenuOpen = false;
							goto(`/app/clients?editId=${encodeURIComponent(selectedCustomer.id)}`);
						}}
					>
						Editar cliente
					</button>
				</div>
			{/if}
			<div class="rounded-lg border border-slate-200 p-3 pr-12 text-sm dark:border-slate-700">
				<p><span class="font-medium">Tel:</span> {selectedCustomer.phone}</p>
				<p><span class="font-medium">Dirección:</span> {selectedCustomer.address}</p>
				<p><span class="font-medium">Entre calles:</span> {selectedCustomer.betweenStreets ?? '-'}</p>
				<p><span class="font-medium">Observación:</span> {selectedCustomer.notes ?? '-'}</p>
			</div>

			<h2 class="mb-3 mt-4 text-base font-semibold">Resumen del pedido</h2>
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

			<div class="mt-4 space-y-2 border-t border-slate-200 pt-3 dark:border-slate-700">
				<div class="flex justify-between text-sm">
					<span class="text-slate-600 dark:text-slate-400">Subtotal</span>
					<span class="font-medium">{formatMoney(subtotal)}</span>
				</div>
				<div class="flex items-center justify-between gap-2">
					<div class="flex items-center gap-1.5">
						<span class="text-sm text-slate-600 dark:text-slate-400">Envío</span>
						<button
							type="button"
							class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-slate-50 text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
							title={$businessStore.shippingPrice > 0
								? `Agregar envío ${formatMoney($businessStore.shippingPrice)}`
								: 'Sin costo de envío configurado'}
							onclick={() => {
								const price = $businessStore.shippingPrice ?? 0;
								updateActiveDraft((draft) => ({
									...draft,
									deliveryCost: draft.deliveryCost === price ? 0 : price
								}));
							}}
						>
							<svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true">
								<path stroke-linecap="round" stroke-linejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1h-1m-1-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m-4 0h4m8 0a2 2 0 104 0m-4 0a2 2 0 114 0m-4 0h4" />
							</svg>
						</button>
					</div>
					<span class="text-sm font-medium">{formatMoney(activeDraft?.deliveryCost ?? 0)}</span>
				</div>
				<div class="flex justify-between border-t border-slate-200 pt-2 dark:border-slate-700">
					<span class="text-sm font-semibold">Total</span>
					<span class="font-semibold">{formatMoney(total)}</span>
				</div>
			</div>

			<div class="mt-4 space-y-3 border-t border-slate-200 pt-3 dark:border-slate-700">
				<label class="block space-y-1">
					<span class="text-sm font-medium">Paga con</span>
					<select
						class="input w-full"
						value={activeDraft?.paymentMethod ?? paymentMethods[0]?.name ?? ''}
						onchange={(e) => {
							const value = (e.currentTarget as HTMLSelectElement).value;
							updateActiveDraft((draft) => ({ ...draft, paymentMethod: value }));
						}}
					>
						{#each paymentMethods as pm}
							<option value={pm.name}>{pm.name}</option>
						{/each}
						{#if paymentMethods.length === 0}
							<option value="Efectivo">Efectivo</option>
						{/if}
					</select>
				</label>
				{#if activeDraft && isCashPayment(activeDraft.paymentMethod)}
					<label class="block space-y-1">
						<span class="text-sm font-medium">Monto recibido</span>
						<input
							class="input"
							type="number"
							min="0"
							step="0.01"
							placeholder="0"
							value={activeDraft.cashReceived || ''}
							oninput={(e) => {
								const value = Number((e.currentTarget as HTMLInputElement).value);
								updateActiveDraft((draft) => ({ ...draft, cashReceived: value || 0 }));
							}}
						/>
					</label>
					<p class="text-sm font-medium">Vuelto: {formatMoney(changeDue)}</p>
				{/if}
			</div>

			<div class="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-3 dark:border-slate-700">
				<button class="btn-primary w-full" onclick={confirmOrder} disabled={!canConfirm()}>Confirmar</button>
				<label class="block space-y-1">
					<span class="text-xs text-slate-500 dark:text-slate-400">Observación (opcional)</span>
					<textarea
						class="input min-h-[4.5rem] w-full resize-y !py-1.5 text-sm"
						rows="3"
						placeholder="Notas del pedido"
						value={activeDraft?.notes ?? ''}
						oninput={(e) => {
							const value = (e.currentTarget as HTMLTextAreaElement).value;
							updateActiveDraft((draft) => ({ ...draft, notes: value }));
						}}
					></textarea>
				</label>
			</div>
		</section>
		{/if}
	</div>
</div>

<Dialog.Root bind:open={configOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-black/50" />
		<Dialog.Content class="fixed left-1/2 top-1/2 z-50 w-full max-w-5xl -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-4 dark:bg-black">
			<div class="mb-3 flex items-center justify-between">
				<h3 class="text-lg font-semibold">
					Configurar {configGroups.length === 1 ? configGroups[0]?.name ?? 'producto' : 'producto'}
				</h3>
				<Dialog.Close class="btn-secondary">Cerrar</Dialog.Close>
			</div>
			{#if configTarget}
				<p class="mb-3 text-sm text-slate-500 dark:text-slate-400">
					{configTarget.product.name} - {configTarget.sku.label}{#if configSelectedNamesList.length}: {configSelectedNamesList.join(', ')}{/if}
					{' '}
					{#if configGroups.length === 1}
						{@const g = configGroups[0]}
						{totalQtyForGroup(g.id)}/{g.max_select}
					{:else}
						{#each configGroups as g, i}{g.name} {totalQtyForGroup(g.id)}/{g.max_select}{#if i < configGroups.length - 1}, {/if}{/each}
					{/if}
				</p>
			{/if}

			<div class="max-h-[60vh] space-y-4 overflow-auto">
				{#each configGroups as group}
					<div class="{configGroups.length > 1 ? 'rounded-lg border border-slate-200 p-3 dark:border-slate-700' : ''}">
						{#if configGroups.length > 1}
							<p class="mb-2 text-sm font-medium text-slate-600 dark:text-slate-400">{group.name} {totalQtyForGroup(group.id)}/{group.max_select}</p>
						{/if}
						<div class="grid grid-cols-7 gap-2">
							{#each getConfigOptions(group.id) as opt}
								{@const isSelected = (selectionsByGroup[group.id] ?? []).includes(opt.id)}
								<div
									class="relative aspect-square w-full overflow-hidden rounded-lg bg-slate-200 dark:bg-neutral-700"
									role="button"
									tabindex="0"
									onclick={() => toggleOption(group, opt.id)}
									onkeydown={(e) => e.key === 'Enter' && toggleOption(group, opt.id)}
								>
									{#if opt.image_url}
										<img src={opt.image_url} alt="" class="absolute inset-0 z-0 h-full w-full object-cover" />
									{:else}
										<div class="absolute inset-0 z-0 flex items-center justify-center text-slate-400 text-2xl">—</div>
									{/if}
									<div
										class="absolute inset-0 z-10 bg-gradient-to-t from-black/85 via-black/30 to-transparent"
										aria-hidden="true"
									></div>
									<div class="absolute inset-0 z-20 flex flex-col justify-between p-2">
										<div class="flex justify-end">
											{#if isSelected}
												<div
													class="inline-flex shrink-0 overflow-hidden rounded-lg border border-white/30 bg-white/20 backdrop-blur-sm"
													onclick={(e) => e.stopPropagation()}
												>
													<button
														type="button"
														class="flex h-7 w-6 shrink-0 items-center justify-center text-white transition-opacity hover:bg-white/20"
														aria-label="Restar"
														onclick={() => {
															configError = '';
															const currentQty = optionQtyById[opt.id] ?? 1;
															if (currentQty <= 1) {
																toggleOption(group, opt.id);
															} else {
																optionQtyById = { ...optionQtyById, [opt.id]: currentQty - 1 };
															}
														}}
													>
														<span class="text-sm font-medium leading-none">−</span>
													</button>
													<span class="flex min-w-[1.5rem] items-center justify-center border-x border-white/30 px-0.5 text-xs font-bold text-white">{(optionQtyById[opt.id] ?? 1)}</span>
													<button
														type="button"
														class="flex h-7 w-6 shrink-0 items-center justify-center text-white transition-opacity hover:bg-white/20 disabled:opacity-50"
														aria-label="Sumar cantidad"
														disabled={totalQtyForGroup(group.id) >= group.max_select}
														onclick={() => {
															configError = '';
															const total = totalQtyForGroup(group.id);
															if (total >= group.max_select) {
																configError = `Máximo ${group.max_select} en ${group.name}. No podés sumar más.`;
																return;
															}
															const q = (optionQtyById[opt.id] ?? 1) + 1;
															optionQtyById = { ...optionQtyById, [opt.id]: q };
														}}
													>
														<span class="text-sm font-medium leading-none">+</span>
													</button>
												</div>
											{:else}
												{@const atLimit = (selectionsByGroup[group.id] ?? []).length >= group.max_select || totalQtyForGroup(group.id) >= group.max_select}
												<button
													type="button"
													class="inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/30 bg-white/20 text-white backdrop-blur-sm transition-opacity hover:bg-white/20 disabled:opacity-50 disabled:pointer-events-none"
													aria-label="Agregar"
													disabled={atLimit}
													onclick={(e) => {
														e.preventDefault();
														e.stopPropagation();
														if (atLimit) return;
														toggleOption(group, opt.id);
													}}
												>
													<span class="text-sm font-medium leading-none">+</span>
												</button>
											{/if}
										</div>
										<div class="flex flex-col">
											<p class="mb-[3px] line-clamp-2 text-xs font-medium leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
												{opt.name}
											</p>
											{#if configOptionCategoryName[opt.id]}
												<span
													class="inline-block w-fit shrink-0 rounded-full px-2 py-0.5 text-[10px] leading-none {getCategoryChipClass(configOptionCategoryName[opt.id])}"
												>
													{configOptionCategoryName[opt.id]}
												</span>
											{/if}
										</div>
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
			{#if clientModalSaving}
				<div id="client-modal-desc" class="flex flex-col items-center justify-center gap-3 py-8">
					<div class="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600 dark:border-neutral-600 dark:border-t-blue-400" aria-hidden="true"></div>
					<p class="text-sm text-slate-600 dark:text-slate-400">Agregando pedido…</p>
				</div>
			{:else if addClientMode}
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
				<Dialog.Close class="btn-secondary" disabled={clientModalSaving}>Cerrar</Dialog.Close>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<Dialog.Root
	open={deleteDraftConfirmId !== null}
	onOpenChange={(open) => {
		if (!open) deleteDraftConfirmId = null;
	}}
>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-black/50" />
		<Dialog.Content
			class="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-neutral-700 dark:bg-black"
			aria-describedby="delete-draft-desc"
			aria-labelledby="delete-draft-title"
		>
			<h2 id="delete-draft-title" class="text-lg font-semibold">Eliminar pedido</h2>
			<p id="delete-draft-desc" class="mt-2 text-sm text-slate-600 dark:text-slate-400">
				¿Eliminar este borrador? No se puede deshacer.
			</p>
			<div class="mt-4 flex justify-end gap-2">
				<Dialog.Close class="btn-secondary">Cancelar</Dialog.Close>
				<button
					type="button"
					class="btn-danger"
					onclick={() => {
						if (deleteDraftConfirmId) void removeDraft(deleteDraftConfirmId);
					}}
				>
					Eliminar
				</button>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
