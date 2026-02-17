<script lang="ts">
	import SideDrawer from '$lib/components/SideDrawer.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import StatusFilterButton from '$lib/components/StatusFilterButton.svelte';
	import type { StatusFilterValue } from '$lib/components/StatusFilterButton.svelte';
	import DataTablePaginator from '$lib/components/table/DataTablePaginator.svelte';
	import { loadTableState, saveTableState } from '$lib/components/table/table.state';
	import { ordersStore } from '$lib/stores/orders';
	import { staffStore } from '$lib/stores/staff';
	import { toastsStore } from '$lib/stores/toasts';
	import type { Order, OrderStatus } from '$lib/types';
	import { formatMoney, todayYmd } from '$lib/utils';
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
	const STATUS_OPTIONS: StatusFilterValue[] = ['TODOS', 'NO_ASIGNADO', 'ASIGNADO', 'COMPLETADO', 'CANCELADO'];
	let dateFilter = $state(todayYmd());
	let selectedOrder = $state<Order | null>(null);
	let drawerOpen = $state(false);
	const cadeteByOrder: Record<string, string> = {};
	let pageIndex = $state(0);
	let pageSize = $state(20);
	const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

	const cadetes = $derived($staffStore.filter((s) => s.role === 'CADETE' && s.active));

	const filtered = $derived(
		$ordersStore.filter((order) => {
			const text = `${order.id} ${order.customerPhoneSnapshot} ${order.addressSnapshot}`.toLowerCase();
			const matchText = !query.trim() || text.includes(query.trim().toLowerCase());
			const matchStatus = statusFilter === 'TODOS' || order.status === statusFilter;
			const matchDate = !dateFilter || order.createdAt.slice(0, 10) === dateFilter;
			return matchText && matchStatus && matchDate;
		})
	);

	const getCadeteName = (order: Order) => cadetes.find((c) => c.id === order.assignedStaffId)?.name ?? '-';

	function persist() {
		if (!browser) return;
		saveTableState('pedidos', {
			globalFilter: query,
			pagination: { pageIndex, pageSize },
			filters: { status: statusFilter, date: dateFilter }
		});
	}

	const orderColumns = $derived([
		{ id: 'id', accessorKey: 'id', header: 'ID' },
		{ id: 'hour', accessorKey: 'hour', header: 'Hora' },
		{ id: 'customerPhoneSnapshot', accessorKey: 'customerPhoneSnapshot', header: 'Cliente/Teléfono' },
		{ id: 'addressSnapshot', accessorKey: 'addressSnapshot', header: 'Dirección' },
		{ id: 'betweenStreetsSnapshot', accessorFn: (r: Order) => r.betweenStreetsSnapshot ?? '-', header: 'Entre' },
		{ id: 'paymentMethod', accessorKey: 'paymentMethod', header: 'Paga con' },
		{ id: 'total', accessorFn: (r: Order) => formatMoney(r.total), header: 'Total' },
		{ id: 'cashierNameSnapshot', accessorFn: (r: Order) => r.cashierNameSnapshot ?? '-', header: 'Caja' },
		{ id: 'cadete', accessorFn: (r: Order) => getCadeteName(r), header: 'Cadete' },
		{ id: 'status', accessorKey: 'status', header: 'Estado' }
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
		await Promise.all([ordersStore.load(), staffStore.load()]);
		if (browser) {
			const saved = loadTableState('pedidos');
			if (saved?.globalFilter !== undefined) query = saved.globalFilter;
			if (saved?.pagination) {
				pageIndex = Math.max(0, saved.pagination.pageIndex);
				pageSize = PAGE_SIZE_OPTIONS.includes(saved.pagination.pageSize) ? saved.pagination.pageSize : 20;
			}
			if (saved?.filters && typeof saved.filters === 'object') {
				const f = saved.filters as { status?: StatusFilterValue; date?: string };
				if (f.status && STATUS_OPTIONS.includes(f.status as StatusFilterValue))
					statusFilter = f.status as StatusFilterValue;
				if (f.date) dateFilter = f.date;
			}
		}
	});
</script>

<div class="space-y-4">
	<div class="panel flex items-center justify-between p-4">
		<div>
			<h1 class="text-base font-semibold">Pedidos</h1>
			<p class="text-xs text-slate-500 dark:text-slate-400">
				Listado de pedidos: filtrar por estado, fecha y buscar por ID, teléfono o dirección.
			</p>
		</div>
	</div>

	<div class="panel p-4">
		<div class="grid grid-cols-1 gap-3 lg:grid-cols-4">
			<label for="pedidos-search" class="sr-only">Buscar</label>
			<input
				id="pedidos-search"
				class="input"
				placeholder="Buscar ID, teléfono, dirección o cliente"
				bind:value={query}
				oninput={() => {
					pageIndex = 0;
					persist();
				}}
			/>
			<div class="flex flex-wrap gap-2 lg:col-span-2">
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
			<input
				class="input"
				type="date"
				bind:value={dateFilter}
				onchange={() => {
					pageIndex = 0;
					persist();
				}}
			/>
		</div>
	</div>

	<div class="panel overflow-auto p-4">
		{#if !browser || !table}
			<p class="py-8 text-center text-sm text-slate-500 dark:text-slate-400">Cargando tabla…</p>
		{:else}
			<table class="min-w-full text-sm">
				<thead class="bg-slate-50 dark:bg-neutral-900">
					<tr>
						<th class="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">ID</th>
						<th class="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Hora</th>
						<th class="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Cliente/Teléfono</th>
						<th class="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Dirección</th>
						<th class="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Entre</th>
						<th class="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Paga con</th>
						<th class="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Total</th>
						<th class="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Caja</th>
						<th class="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Cadete</th>
						<th class="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Estado</th>
						<th class="px-3 py-2 text-right font-medium text-slate-600 dark:text-slate-300">Acciones</th>
					</tr>
				</thead>
				<tbody>
					{#each paginatedRows as row}
						{@const order = row.original}
						<tr class="border-t border-slate-100 hover:bg-slate-50 dark:border-neutral-800 dark:hover:bg-neutral-900/60">
							<td class="whitespace-nowrap px-3 py-2">{order.id}</td>
							<td class="whitespace-nowrap px-3 py-2">{order.hour}</td>
							<td class="whitespace-nowrap px-3 py-2">{order.customerPhoneSnapshot}</td>
							<td class="whitespace-nowrap px-3 py-2">{order.addressSnapshot}</td>
							<td class="whitespace-nowrap px-3 py-2">{order.betweenStreetsSnapshot ?? '-'}</td>
							<td class="whitespace-nowrap px-3 py-2">{order.paymentMethod}</td>
							<td class="whitespace-nowrap px-3 py-2">{formatMoney(order.total)}</td>
							<td class="whitespace-nowrap px-3 py-2">{order.cashierNameSnapshot ?? '-'}</td>
							<td class="whitespace-nowrap px-3 py-2">{getCadeteName(order)}</td>
							<td class="whitespace-nowrap px-3 py-2"><StatusBadge status={order.status} /></td>
							<td class="px-3 py-2 text-right">
								<div class="flex flex-wrap justify-end gap-2">
									<button
										class="btn-secondary !px-2 !py-1 text-xs"
										onclick={() => {
											selectedOrder = order;
											drawerOpen = true;
										}}
									>
										Ver
									</button>
									<select class="input !w-36 !py-1 text-xs" bind:value={cadeteByOrder[order.id]}>
										<option value="">Cadete</option>
										{#each cadetes as cadete}
											<option value={cadete.id}>{cadete.name}</option>
										{/each}
									</select>
									<button class="btn-secondary !px-2 !py-1 text-xs" onclick={() => assignOrder(order.id)}>Asignar</button>
									<button
										class="btn-secondary !px-2 !py-1 text-xs"
										onclick={() => updateStatus(order.id, 'COMPLETADO')}
									>
										Completar
									</button>
									<button class="btn-danger !px-2 !py-1 text-xs" onclick={() => updateStatus(order.id, 'CANCELADO')}>Cancelar</button>
									<a class="btn-secondary !px-2 !py-1 text-xs" href={`/app/orders/${order.id}/edit`}>Editar</a>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
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

<SideDrawer bind:open={drawerOpen} title="Detalle del pedido">
	{#if selectedOrder}
		<div class="space-y-4 text-sm">
			<div>
				<p class="font-medium">Pedido {selectedOrder.id}</p>
				<p class="text-slate-500">{selectedOrder.hour} - {selectedOrder.addressSnapshot}</p>
			</div>
			<div class="space-y-2">
				{#each selectedOrder.items as item}
					<div class="flex items-center justify-between rounded border border-slate-200 px-2 py-1 dark:border-neutral-800">
						<span>{item.qty}x {item.nameSnapshot}</span>
						<span>{formatMoney(item.subtotal)}</span>
					</div>
				{/each}
			</div>
			<p>Total: <strong>{formatMoney(selectedOrder.total)}</strong></p>
		</div>
	{/if}
</SideDrawer>
