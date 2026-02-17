<script lang="ts">
	import SideDrawer from '$lib/components/SideDrawer.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import StatusFilterButton from '$lib/components/StatusFilterButton.svelte';
	import type { StatusFilterValue } from '$lib/components/StatusFilterButton.svelte';
	import DataTablePaginator from '$lib/components/table/DataTablePaginator.svelte';
	import { loadTableState, saveTableState } from '$lib/components/table/table.state';
	import { ordersStore } from '$lib/stores/orders';
	import { staffStore } from '$lib/stores/staff';
	import { staffGuestsStore } from '$lib/stores/staffGuests';
	import { toastsStore } from '$lib/stores/toasts';
	import type { Order, OrderStatus } from '$lib/types';
	import { formatMoney, formatDateTime, todayYmd } from '$lib/utils';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import {
		createTable,
		getCoreRowModel,
		getPaginationRowModel,
		type ColumnDef,
		type Table
	} from '@tanstack/table-core';

	let query = $state('');
	let statusFilter = $state<StatusFilterValue>('TODOS');
	const STATUS_OPTIONS: StatusFilterValue[] = [
		'TODOS',
		'BORRADOR',
		'NO_ASIGNADO',
		'ASIGNADO',
		'COMPLETADO',
		'CANCELADO'
	];
	let selectedOrder = $state<Order | null>(null);
	let drawerOpen = $state(false);
	/** IDs de pedidos seleccionados para acciones en lote */
	let selectedOrderIds = $state<Set<string>>(new Set());
	/** ID del pedido cuyo menú de tres puntos está abierto */
	let orderMenuOpenId = $state<string | null>(null);
	/** ID del pedido a eliminar (modal de confirmación) */
	let deleteConfirmOrderId = $state<string | null>(null);
	const cadeteByOrder: Record<string, string> = {};
	let pageIndex = $state(0);
	let pageSize = $state(20);
	const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

	type CadeteOption = { id: string; name: string; isGuest: boolean };
	const cadetes = $derived.by((): CadeteOption[] => {
		const staff = $staffStore.filter((s) => (s.roles ?? [s.role]).includes('CADETE') && s.active).map((s) => ({ id: s.id, name: s.name, isGuest: false }));
		const guests = $staffGuestsStore.filter((g) => (g.roles ?? [g.role]).includes('CADETE') && g.active).map((g) => ({ id: g.id, name: g.name, isGuest: true }));
		return [...staff, ...guests].sort((a, b) => a.name.localeCompare(b.name));
	});

	const getCadeteName = (order: Order) => {
		if (order.assignedStaffId) {
			const s = $staffStore.find((x) => x.id === order.assignedStaffId);
			return s?.name ?? '-';
		}
		if (order.assignedStaffGuestId) {
			const g = $staffGuestsStore.find((x) => x.id === order.assignedStaffGuestId);
			return g?.name ?? '-';
		}
		return '-';
	};

	const filtered = $derived(
		$ordersStore.filter((order) => {
			const text = `${order.id} ${order.customerPhoneSnapshot} ${order.addressSnapshot}`.toLowerCase();
			const matchText = !query.trim() || text.includes(query.trim().toLowerCase());
			const matchStatus = statusFilter === 'TODOS' || order.status === statusFilter;
			return matchText && matchStatus;
		})
	);

	const toggleSelectOrder = (orderId: string) => {
		selectedOrderIds = new Set(selectedOrderIds);
		if (selectedOrderIds.has(orderId)) selectedOrderIds.delete(orderId);
		else selectedOrderIds.add(orderId);
	};

	const toggleSelectAllOnPage = () => {
		const rows = table?.getRowModel().rows ?? [];
		const ids = rows.map((r) => r.original.id);
		const allSelected = ids.every((id) => selectedOrderIds.has(id));
		selectedOrderIds = new Set(selectedOrderIds);
		if (allSelected) ids.forEach((id) => selectedOrderIds.delete(id));
		else ids.forEach((id) => selectedOrderIds.add(id));
	};

	const bulkComplete = async () => {
		const orders = $ordersStore.filter((o) => selectedOrderIds.has(o.id) && o.status === 'ASIGNADO');
		for (const o of orders) {
			await ordersStore.updateStatus(o.id, 'COMPLETADO');
		}
		selectedOrderIds = new Set();
		toastsStore.success(orders.length ? 'Pedidos marcados como completados' : 'Solo los pedidos asignados se pueden completar');
	};

	const bulkCancel = async () => {
		const orders = $ordersStore.filter(
			(o) => selectedOrderIds.has(o.id) && (o.status === 'NO_ASIGNADO' || o.status === 'ASIGNADO')
		);
		for (const o of orders) {
			await ordersStore.updateStatus(o.id, 'CANCELADO');
		}
		selectedOrderIds = new Set();
		toastsStore.success(orders.length ? 'Pedidos cancelados' : 'Solo se pueden cancelar pedidos no asignados o asignados');
	};

	const confirmDeleteOrder = async () => {
		if (!deleteConfirmOrderId) return;
		try {
			await ordersStore.delete(deleteConfirmOrderId);
			deleteConfirmOrderId = null;
			toastsStore.success('Pedido eliminado');
		} catch {
			toastsStore.error('No se pudo eliminar el pedido');
		}
	};

	function persist() {
		if (!browser) return;
		saveTableState('pedidos', {
			globalFilter: query,
			pagination: { pageIndex, pageSize },
			filters: { status: statusFilter }
		});
	}

	const orderColumns = $derived([
		{ id: 'id', accessorKey: 'id', header: '#' },
		{ id: 'createdAt', accessorKey: 'createdAt', header: 'Fecha' },
		{ id: 'customerPhoneSnapshot', accessorKey: 'customerPhoneSnapshot', header: 'Cliente' },
		{ id: 'addressSnapshot', accessorKey: 'addressSnapshot', header: 'Dirección' },
		{ id: 'total', accessorFn: (r: Order) => formatMoney(r.total), header: 'Total' },
		{ id: 'status', accessorKey: 'status', header: 'Estado' },
		{ id: 'cadete', accessorFn: (r: Order) => getCadeteName(r), header: 'Cadete' }
	] as ColumnDef<Order, unknown>[]);

	const tableState = $derived({ pagination: { pageIndex, pageSize } });

	const table = $derived.by((): Table<Order> | null => {
		if (!browser) return null;
		return createTable({
			data: filtered,
			columns: orderColumns,
			getRowId: (row) => row.id,
			getCoreRowModel: getCoreRowModel(),
			getPaginationRowModel: getPaginationRowModel(),
			onPaginationChange: (updater) => {
				const next = typeof updater === 'function' ? updater({ pageIndex, pageSize }) : updater;
				pageIndex = next.pageIndex;
				pageSize = next.pageSize;
				persist();
			},
			onStateChange: (updater: unknown) => {
				const prev = { pagination: { pageIndex, pageSize } };
				const next = typeof updater === 'function' ? (updater as (p: typeof prev) => typeof prev)(prev) : updater;
				const pag = (next as { pagination?: { pageIndex: number; pageSize: number } })?.pagination;
				if (pag) {
					pageIndex = pag.pageIndex;
					pageSize = pag.pageSize;
					persist();
				}
			},
			state: { pagination: tableState.pagination },
			renderFallbackValue: ''
		}) as Table<Order>;
	});

	const paginatedRows = $derived(table?.getRowModel().rows ?? []);
	const tablePageCount = $derived(table?.getPageCount() ?? 1);
	const totalFiltered = $derived(filtered.length);

	$effect(() => {
		const count = tablePageCount;
		if (count > 0 && pageIndex >= count) {
			pageIndex = Math.max(0, count - 1);
			persist();
		}
	});

	function setPageIndex(idx: number) {
		pageIndex = Math.max(0, Math.min(idx, Math.max(0, tablePageCount - 1)));
		persist();
	}
	function setPageSize(size: number) {
		pageSize = size;
		pageIndex = 0;
		persist();
	}

	const assignOrder = async (orderId: string) => {
		const staffId = cadeteByOrder[orderId];
		if (!staffId) return;
		await ordersStore.assign(orderId, staffId);
		toastsStore.success('Pedido asignado');
	};

	const updateStatus = async (orderId: string, status: OrderStatus) => {
		await ordersStore.updateStatus(orderId, status);
		toastsStore.success('Pedido actualizado');
	};

	onMount(async () => {
		try {
			await Promise.all([ordersStore.load(), staffStore.load(), staffGuestsStore.load()]);
		} catch {
			toastsStore.error(
				'No se pudieron cargar los pedidos. Comprobá la conexión e iniciá sesión de nuevo si hace falta.'
			);
		}
		if (browser) {
			const saved = loadTableState('pedidos');
			if (saved?.globalFilter !== undefined) query = saved.globalFilter;
			if (saved?.pagination) {
				pageIndex = Math.max(0, saved.pagination.pageIndex);
				pageSize = PAGE_SIZE_OPTIONS.includes(saved.pagination.pageSize) ? saved.pagination.pageSize : 20;
			}
			if (saved?.filters && typeof saved.filters === 'object') {
				const f = saved.filters as { status?: StatusFilterValue };
				if (f.status && STATUS_OPTIONS.includes(f.status as StatusFilterValue))
					statusFilter = f.status as StatusFilterValue;
			}
		}
	});
</script>

<div class="space-y-4">
	<div class="panel flex items-center justify-between p-4">
		<div>
			<h1 class="text-base font-semibold">Pedidos</h1>
			<p class="text-xs text-slate-500 dark:text-slate-400">
				Listado de pedidos: filtrar por estado y buscar por ID, teléfono o dirección.
			</p>
		</div>
	</div>

	<div class="panel p-4">
		<div class="flex flex-wrap items-center gap-3">
			<label for="pedidos-search" class="sr-only">Buscar</label>
			<input
				id="pedidos-search"
				class="input max-w-md"
				placeholder="Buscar ID, teléfono, dirección o cliente"
				bind:value={query}
				oninput={() => {
					pageIndex = 0;
					persist();
				}}
			/>
			<div class="flex flex-wrap gap-2">
				{#each STATUS_OPTIONS as status}
					<StatusFilterButton
						status={status}
						active={statusFilter === status}
						onClick={() => {
							statusFilter = status;
							pageIndex = 0;
							persist();
						}}
					/>
				{/each}
			</div>
		</div>
	</div>

	{#if selectedOrderIds.size > 0}
		<div class="panel flex items-center gap-4 p-3">
			<span class="text-sm text-slate-600 dark:text-slate-400">{selectedOrderIds.size} seleccionado(s)</span>
			<button type="button" class="btn-primary !py-1.5 text-xs" onclick={() => bulkComplete()}>
				Marcar como Completado
			</button>
			<button type="button" class="btn-danger !py-1.5 text-xs" onclick={() => bulkCancel()}>
				Cancelar
			</button>
			<button type="button" class="btn-secondary !py-1.5 text-xs" onclick={() => (selectedOrderIds = new Set())}>
				Desmarcar
			</button>
		</div>
	{/if}

	<div class="panel p-4">
		{#if !browser || !table}
			<p class="py-8 text-center text-sm text-slate-500 dark:text-slate-400">Cargando tabla…</p>
		{:else}
			<table class="min-w-full text-sm">
				<thead class="bg-slate-50 dark:bg-neutral-900">
					<tr>
						<th class="w-10 px-2 py-2">
							<input
								type="checkbox"
								class="rounded border-slate-300"
								checked={paginatedRows.length > 0 && paginatedRows.every((r) => selectedOrderIds.has(r.original.id))}
								onchange={() => toggleSelectAllOnPage()}
								aria-label="Seleccionar todos"
							/>
						</th>
						<th class="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">#</th>
						<th class="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Fecha</th>
						<th class="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Cliente</th>
						<th class="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Dirección</th>
						<th class="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Total</th>
						<th class="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Estado</th>
						<th class="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Cadete</th>
						<th class="w-12 px-2 py-2 text-right font-medium text-slate-600 dark:text-slate-300">Acciones</th>
					</tr>
				</thead>
				<tbody>
					{#each paginatedRows as row, i}
						{@const order = row.original}
						{@const rowNum = pageIndex * pageSize + i + 1}
						<tr class="border-t border-slate-100 hover:bg-slate-50 dark:border-neutral-800 dark:hover:bg-neutral-900/60">
							<td class="w-10 px-2 py-2">
								<input
									type="checkbox"
									class="rounded border-slate-300"
									checked={selectedOrderIds.has(order.id)}
									onchange={() => toggleSelectOrder(order.id)}
									aria-label="Seleccionar pedido #{rowNum}"
								/>
							</td>
							<td class="whitespace-nowrap px-3 py-2">#{rowNum}</td>
							<td class="whitespace-nowrap px-3 py-2">{formatDateTime(order.createdAt)}</td>
							<td class="whitespace-nowrap px-3 py-2">{order.customerPhoneSnapshot}</td>
							<td class="max-w-[180px] truncate px-3 py-2" title={order.addressSnapshot}>{order.addressSnapshot}</td>
							<td class="whitespace-nowrap px-3 py-2">{formatMoney(order.total)}</td>
							<td class="whitespace-nowrap px-3 py-2"><StatusBadge status={order.status} /></td>
							<td class="whitespace-nowrap px-3 py-2">{getCadeteName(order)}</td>
							<td class="relative w-12 px-2 py-2 text-right">
								<button
									type="button"
									class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-neutral-700 dark:hover:text-neutral-300"
									aria-label="Abrir acciones"
									onclick={(e) => {
										e.stopPropagation();
										orderMenuOpenId = orderMenuOpenId === order.id ? null : order.id;
									}}
								>
									<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
										<circle cx="12" cy="6" r="1.5" />
										<circle cx="12" cy="12" r="1.5" />
										<circle cx="12" cy="18" r="1.5" />
									</svg>
								</button>
								{#if orderMenuOpenId === order.id}
									<div
										class="absolute right-0 top-full z-20 mt-1 min-w-[200px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-800"
										role="menu"
									>
										<button
											type="button"
											class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-neutral-700"
											role="menuitem"
											onclick={() => {
												selectedOrder = order;
												drawerOpen = true;
												orderMenuOpenId = null;
											}}
										>
											Ver
										</button>
										{#if order.status === 'BORRADOR'}
											<a
												class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-neutral-700"
												href={`/app/create_order?draftId=${encodeURIComponent(order.id)}`}
												onclick={() => (orderMenuOpenId = null)}
											>
												Continuar
											</a>
										{/if}
										{#if order.status === 'NO_ASIGNADO' || order.status === 'ASIGNADO'}
											<div class="border-t border-slate-100 px-2 py-1 text-xs font-medium text-slate-500 dark:border-neutral-700 dark:text-slate-400">
												Asignar a
											</div>
											{#each cadetes as cadete}
												<button
													type="button"
													class="flex w-full items-center gap-2 px-3 py-1.5 pl-5 text-left text-sm hover:bg-slate-100 dark:hover:bg-neutral-700"
													role="menuitem"
													onclick={() => {
														if (cadete.isGuest) {
															ordersStore.assignGuest(order.id, cadete.id);
														} else {
															cadeteByOrder[order.id] = cadete.id;
															assignOrder(order.id);
														}
														orderMenuOpenId = null;
													}}
												>
													{cadete.name}
												</button>
											{/each}
										{/if}
										{#if order.status === 'ASIGNADO'}
											<button
												type="button"
												class="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-100 dark:border-neutral-700 dark:hover:bg-neutral-700"
												role="menuitem"
												onclick={() => {
													updateStatus(order.id, 'COMPLETADO');
													orderMenuOpenId = null;
												}}
											>
												Marcar como Completado
											</button>
										{/if}
										{#if order.status === 'NO_ASIGNADO' || order.status === 'ASIGNADO'}
											<button
												type="button"
												class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-neutral-700"
												role="menuitem"
												onclick={() => {
													updateStatus(order.id, 'CANCELADO');
													orderMenuOpenId = null;
												}}
											>
												Cancelar
											</button>
										{/if}
										{#if order.status === 'NO_ASIGNADO'}
											<button
												type="button"
												class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-neutral-700"
												role="menuitem"
												onclick={() => {
													updateStatus(order.id, 'BORRADOR');
													orderMenuOpenId = null;
												}}
											>
												Pasar a borrador
											</button>
										{/if}
										{#if order.status === 'CANCELADO'}
											<button
												type="button"
												class="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-left text-sm text-rose-600 hover:bg-slate-100 dark:border-neutral-700 dark:hover:bg-neutral-700 dark:text-rose-400"
												role="menuitem"
												onclick={() => {
													deleteConfirmOrderId = order.id;
													orderMenuOpenId = null;
												}}
											>
												Eliminar
											</button>
										{/if}
									</div>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
			{#if orderMenuOpenId}
				<button
					type="button"
					class="fixed inset-0 z-10 cursor-default"
					aria-label="Cerrar menú"
					onclick={() => (orderMenuOpenId = null)}
				></button>
			{/if}
			<div class="mt-4">
				<DataTablePaginator
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
	</div>
</div>

{#if deleteConfirmOrderId}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-order-title">
		<div class="max-w-sm rounded-xl bg-white p-4 shadow-xl dark:bg-neutral-800">
			<h2 id="delete-order-title" class="text-base font-semibold">¿Eliminar pedido?</h2>
			<p class="mt-2 text-sm text-slate-600 dark:text-slate-400">
				El pedido se eliminará definitivamente. Solo se puede eliminar un pedido cancelado. ¿Querés continuar?
			</p>
			<div class="mt-4 flex justify-end gap-2">
				<button type="button" class="btn-secondary" onclick={() => (deleteConfirmOrderId = null)}>
					No
				</button>
				<button type="button" class="btn-danger" onclick={() => confirmDeleteOrder()}>
					Sí, eliminar
				</button>
			</div>
		</div>
	</div>
{/if}

<SideDrawer bind:open={drawerOpen} title="Detalle del pedido">
	{#if selectedOrder}
		{@const orderSubtotal = selectedOrder.items.reduce((acc, item) => acc + item.subtotal, 0)}
		<div class="space-y-4 text-sm">
			<dl class="space-y-2">
				<div>
					<dt class="text-xs font-medium text-slate-500 dark:text-slate-400">Fecha de creación</dt>
					<dd class="font-medium">{formatDateTime(selectedOrder.createdAt)}</dd>
				</div>
				<div>
					<dt class="text-xs font-medium text-slate-500 dark:text-slate-400">Número de pedido</dt>
					<dd class="font-mono text-xs">{selectedOrder.id}</dd>
				</div>
				<div>
					<dt class="text-xs font-medium text-slate-500 dark:text-slate-400">Cliente</dt>
					<dd>{selectedOrder.customerPhoneSnapshot}</dd>
				</div>
				<div>
					<dt class="text-xs font-medium text-slate-500 dark:text-slate-400">Dirección</dt>
					<dd>{selectedOrder.addressSnapshot}</dd>
				</div>
				<div>
					<dt class="text-xs font-medium text-slate-500 dark:text-slate-400">Entre</dt>
					<dd>{selectedOrder.betweenStreetsSnapshot ?? '—'}</dd>
				</div>
				<div>
					<dt class="text-xs font-medium text-slate-500 dark:text-slate-400">Observación del pedido</dt>
					<dd class="whitespace-pre-wrap">{selectedOrder.notes ?? '—'}</dd>
				</div>
			</dl>

			<div>
				<p class="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">Items</p>
				<div class="space-y-1 rounded-lg border border-slate-200 p-2 dark:border-neutral-800">
					{#each selectedOrder.items as item}
						<div class="flex items-center justify-between gap-2">
							<span>{item.qty}x {item.nameSnapshot}</span>
							<span>{formatMoney(item.subtotal)}</span>
						</div>
					{/each}
				</div>
			</div>

			<dl class="space-y-1 border-t border-slate-200 pt-3 dark:border-slate-700">
				<div class="flex justify-between gap-2">
					<dt class="text-slate-600 dark:text-slate-400">Subtotal</dt>
					<dd>{formatMoney(orderSubtotal)}</dd>
				</div>
				<div class="flex justify-between gap-2">
					<dt class="text-slate-600 dark:text-slate-400">Envío</dt>
					<dd>{selectedOrder.total > orderSubtotal ? formatMoney(selectedOrder.total - orderSubtotal) : '—'}</dd>
				</div>
				<div class="flex justify-between gap-2 border-t border-slate-200 pt-2 font-semibold dark:border-slate-700">
					<dt>Total</dt>
					<dd>{formatMoney(selectedOrder.total)}</dd>
				</div>
			</dl>

			<dl class="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-700">
				<div>
					<dt class="text-xs font-medium text-slate-500 dark:text-slate-400">Asignado a</dt>
					<dd>{getCadeteName(selectedOrder)}</dd>
				</div>
				<div>
					<dt class="text-xs font-medium text-slate-500 dark:text-slate-400">Tomado por</dt>
					<dd>{selectedOrder.cashierNameSnapshot ?? '—'}</dd>
				</div>
			</dl>
		</div>
	{/if}
</SideDrawer>
