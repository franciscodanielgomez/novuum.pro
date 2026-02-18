<script lang="ts">
	import { RangeCalendar } from 'bits-ui';
	import { CalendarDate } from '@internationalized/date';
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
	import { formatMoney, formatDateTime, formatOrderNumber, sameDate, todayYmd, dateInArgentinaYmd } from '$lib/utils';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	function ymdToCalendarDate(ymd: string): CalendarDate | undefined {
		if (!ymd || ymd.length < 10) return undefined;
		const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
		if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return undefined;
		return new CalendarDate(y, m, d);
	}
	function calendarDateToYmd(d: { year: number; month: number; day: number } | undefined): string {
		if (!d) return '';
		const month = String(d.month).padStart(2, '0');
		const day = String(d.day).padStart(2, '0');
		return `${d.year}-${month}-${day}`;
	}
	function formatDateShort(ymd: string): string {
		if (!ymd || ymd.length < 10) return '';
		const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
		const date = new Date(y, m - 1, d);
		return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
	}
	import {
		createTable,
		getCoreRowModel,
		getPaginationRowModel,
		type ColumnDef,
		type Table
	} from '@tanstack/table-core';

	let query = $state('');
	let statusFilter = $state<StatusFilterValue>('TODOS');
	let todayOnly = $state(true);
	let fechasDropdownOpen = $state(false);
	let tomadoPorDropdownOpen = $state(false);
	let asignadoADropdownOpen = $state(false);
	let filterDateFrom = $state('');
	let filterDateTo = $state('');
	let filterCashier = $state('');
	let filterCreatedByUserId = $state('');
	let filterCadeteId = $state('');
	let filterCustomerId = $state('');
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

	const ORDER_TABLE_COLUMNS = [
		{ id: 'num', header: 'Nº' },
		{ id: 'fecha', header: 'Fecha' },
		{ id: 'cliente', header: 'Cliente' },
		{ id: 'direccion', header: 'Dirección' },
		{ id: 'total', header: 'Total' },
		{ id: 'estado', header: 'Estado' },
		{ id: 'cadete', header: 'Cadete' }
	] as const;

	type SortColumn = (typeof ORDER_TABLE_COLUMNS)[number]['id'];
	let sortColumn = $state<SortColumn>('fecha');
	let sortDir = $state<'asc' | 'desc'>('desc');

	let columnVisibility = $state<Record<string, boolean>>({});
	let columnVisibilityOpen = $state(false);

	const isColumnVisible = (id: string) => columnVisibility[id] !== false;

	const toggleColumnVisibility = (id: string) => {
		columnVisibility = { ...columnVisibility, [id]: !isColumnVisible(id) };
		persist();
	};

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

	const uniqueCashiers = $derived.by(() => {
		const names = $ordersStore.map((o) => o.cashierNameSnapshot).filter(Boolean) as string[];
		return [...new Set(names)].sort((a, b) => a.localeCompare(b));
	});

	const dateRangeValue = $derived({
		start: ymdToCalendarDate(filterDateFrom),
		end: ymdToCalendarDate(filterDateTo)
	});

	const fechasButtonLabel = $derived.by(() => {
		if (filterDateFrom && filterDateTo && filterDateFrom !== filterDateTo) {
			return `${formatDateShort(filterDateFrom)} — ${formatDateShort(filterDateTo)}`;
		}
		if (filterDateFrom) return formatDateShort(filterDateFrom);
		return 'Fechas';
	});

	const activeFilterCount = $derived(
		(todayOnly ? 1 : 0) +
			(filterDateFrom || filterDateTo ? 1 : 0) +
			(statusFilter !== 'TODOS' ? 1 : 0) +
			(filterCashier.trim() ? 1 : 0) +
			(filterCreatedByUserId ? 1 : 0) +
			(filterCadeteId ? 1 : 0) +
			(filterCustomerId ? 1 : 0)
	);

	const uniqueCustomers = $derived.by(() => {
		const seen = new Set<string>();
		return $ordersStore
			.filter((o) => o.customerId && !seen.has(o.customerId) && (seen.add(o.customerId), true))
			.map((o) => ({ id: o.customerId, phone: o.customerPhoneSnapshot }))
			.sort((a, b) => a.phone.localeCompare(b.phone));
	});

	const filtered = $derived(
		$ordersStore.filter((order) => {
			const orderNumPadded = formatOrderNumber(order.orderNumber);
			const text = `${order.orderNumber} ${orderNumPadded} ${order.id} ${order.customerPhoneSnapshot} ${order.addressSnapshot}`.toLowerCase();
			const matchText = !query.trim() || text.includes(query.trim().toLowerCase());
			const matchStatus = statusFilter === 'TODOS' || order.status === statusFilter;
			const matchToday = !todayOnly || sameDate(order.createdAt, todayYmd());
			const orderYmdArgentina = dateInArgentinaYmd(order.createdAt);
			const matchDateFrom = !filterDateFrom || orderYmdArgentina >= filterDateFrom;
			const matchDateTo = !filterDateTo || orderYmdArgentina <= filterDateTo;
			const matchCashier = !filterCashier.trim() || (order.cashierNameSnapshot ?? '') === filterCashier;
			const matchCreatedByUser = !filterCreatedByUserId || order.createdByUserId === filterCreatedByUserId;
			const matchCadete =
				!filterCadeteId ||
				order.assignedStaffId === filterCadeteId ||
				order.assignedStaffGuestId === filterCadeteId;
			const matchCustomer = !filterCustomerId || order.customerId === filterCustomerId;
			return (
				matchText &&
				matchStatus &&
				matchToday &&
				matchDateFrom &&
				matchDateTo &&
				matchCashier &&
				matchCreatedByUser &&
				matchCadete &&
				matchCustomer
			);
		})
	);

	const sortedFiltered = $derived.by(() => {
		const list = [...filtered];
		const dir = sortDir === 'asc' ? 1 : -1;
		list.sort((a, b) => {
			let va: string | number;
			let vb: string | number;
			switch (sortColumn) {
				case 'num':
					va = a.orderNumber;
					vb = b.orderNumber;
					return dir * (Number(va) - Number(vb));
				case 'fecha':
					va = a.createdAt;
					vb = b.createdAt;
					return dir * String(va).localeCompare(String(vb));
				case 'cliente':
					va = a.customerPhoneSnapshot ?? '';
					vb = b.customerPhoneSnapshot ?? '';
					return dir * String(va).localeCompare(String(vb));
				case 'direccion':
					va = a.addressSnapshot ?? '';
					vb = b.addressSnapshot ?? '';
					return dir * String(va).localeCompare(String(vb));
				case 'total':
					va = a.total;
					vb = b.total;
					return dir * (Number(va) - Number(vb));
				case 'estado':
					va = a.status;
					vb = b.status;
					return dir * String(va).localeCompare(String(vb));
				case 'cadete':
					va = getCadeteName(a);
					vb = getCadeteName(b);
					return dir * String(va).localeCompare(String(vb));
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
		persist();
	};

	const SortIcon = (col: SortColumn) => (sortColumn === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕');

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
		const orders = $ordersStore.filter((o) => selectedOrderIds.has(o.id) && o.status !== 'CANCELADO');
		for (const o of orders) {
			await ordersStore.updateStatus(o.id, 'CANCELADO');
		}
		bulkCancelConfirmOpen = false;
		selectedOrderIds = new Set();
		toastsStore.success(orders.length ? `${orders.length} pedido(s) marcado(s) como cancelado(s)` : 'Nada que cancelar');
	};

	/** Pedidos seleccionados que están en NO_ASIGNADO (se pueden asignar en grupo). */
	const selectedNoAsignadoIds = $derived(
		$ordersStore.filter((o) => selectedOrderIds.has(o.id) && o.status === 'NO_ASIGNADO').map((o) => o.id)
	);
	/** Pedidos seleccionados que están en ASIGNADO (se pueden marcar completado en grupo). */
	const selectedAsignadoIds = $derived(
		$ordersStore.filter((o) => selectedOrderIds.has(o.id) && o.status === 'ASIGNADO').map((o) => o.id)
	);
	/** Pedidos seleccionados que se pueden eliminar (BORRADOR o CANCELADO). */
	const selectedDeletableIds = $derived(
		$ordersStore.filter((o) => selectedOrderIds.has(o.id) && (o.status === 'BORRADOR' || o.status === 'CANCELADO')).map((o) => o.id)
	);
	/** Hay más de un estado entre los seleccionados → solo se permite Cancelar (+ Desmarcar). */
	const hasMixedStatuses = $derived.by(() => {
		const statuses = new Set<string>();
		for (const o of $ordersStore) {
			if (selectedOrderIds.has(o.id)) statuses.add(o.status);
		}
		return statuses.size > 1;
	});
	let bulkAssignOpen = $state(false);
	let bulkCancelConfirmOpen = $state(false);
	let bulkDeleteConfirmOpen = $state(false);

	const bulkAssign = async (cadete: CadeteOption) => {
		const ids = selectedNoAsignadoIds;
		for (const orderId of ids) {
			if (cadete.isGuest) {
				await ordersStore.assignGuest(orderId, cadete.id);
			} else {
				await ordersStore.assign(orderId, cadete.id);
			}
		}
		bulkAssignOpen = false;
		selectedOrderIds = new Set();
		toastsStore.success(ids.length ? `${ids.length} pedido(s) asignado(s) a ${cadete.name}` : 'Ningún pedido no asignado seleccionado');
	};

	const bulkUnassign = async () => {
		const ids = selectedAsignadoIds;
		for (const orderId of ids) {
			await ordersStore.unassign(orderId);
		}
		selectedOrderIds = new Set();
		toastsStore.success(ids.length ? `${ids.length} pedido(s) pasados a No asignado` : 'Ningún pedido asignado seleccionado');
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

	const confirmBulkDelete = async () => {
		const ids = selectedDeletableIds;
		let ok = 0;
		for (const id of ids) {
			try {
				await ordersStore.delete(id);
				ok += 1;
			} catch {
				// sigue con el resto
			}
		}
		bulkDeleteConfirmOpen = false;
		selectedOrderIds = new Set();
		toastsStore.success(ok ? `${ok} pedido(s) eliminado(s)` : 'No se pudo eliminar ningún pedido');
	};

	function clearFilters() {
		todayOnly = true;
		statusFilter = 'TODOS';
		filterDateFrom = '';
		filterDateTo = '';
		filterCashier = '';
		filterCreatedByUserId = '';
		filterCadeteId = '';
		filterCustomerId = '';
		pageIndex = 0;
		persist();
		toastsStore.success('Filtros limpiados');
	}

	function persist() {
		if (!browser) return;
		saveTableState('pedidos', {
			globalFilter: query,
			pagination: { pageIndex, pageSize },
			sorting: { column: sortColumn, dir: sortDir },
			filters: {
				status: statusFilter,
				todayOnly,
				dateFrom: filterDateFrom,
				dateTo: filterDateTo,
				cashier: filterCashier,
				createdByUserId: filterCreatedByUserId,
				cadeteId: filterCadeteId,
				customerId: filterCustomerId
			},
			columnVisibility: columnVisibility
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
			data: sortedFiltered,
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

	const printOrder = (order: Order) => {
		const subtotal = order.items.reduce((acc, i) => acc + i.subtotal, 0);
		const envio = order.total > subtotal ? order.total - subtotal : 0;
		const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Pedido ${formatOrderNumber(order.orderNumber)}</title>
<style>body{font-family:system-ui,sans-serif;padding:1rem;font-size:14px;} table{width:100%;border-collapse:collapse;} th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;} th{background:#f5f5f5;} .total{font-weight:bold;}</style>
</head><body>
<h2>Pedido #${formatOrderNumber(order.orderNumber)}</h2>
<p><strong>Fecha:</strong> ${formatDateTime(order.createdAt)}</p>
<p><strong>Cliente:</strong> ${order.customerPhoneSnapshot}</p>
<p><strong>Dirección:</strong> ${order.addressSnapshot}</p>
<p><strong>Entre:</strong> ${order.betweenStreetsSnapshot ?? '—'}</p>
<p><strong>Observación:</strong> ${order.notes ?? '—'}</p>
<table>
<thead><tr><th>Item</th><th>Cant.</th><th>P.unit</th><th>Subtotal</th></tr></thead>
<tbody>
${order.items.map((i) => `<tr><td>${i.nameSnapshot}</td><td>${i.qty}</td><td>${formatMoney(i.unitPrice)}</td><td>${formatMoney(i.subtotal)}</td></tr>`).join('')}
</tbody>
</table>
<p>Subtotal: ${formatMoney(subtotal)}</p>
${envio > 0 ? `<p>Envío: ${formatMoney(envio)}</p>` : ''}
<p class="total">Total: ${formatMoney(order.total)}</p>
<p><strong>Tomado por:</strong> ${order.cashierNameSnapshot ?? '—'}</p>
<p><strong>Asignado a:</strong> ${getCadeteName(order)}</p>
</body></html>`;
		const w = window.open('', '_blank');
		if (w) {
			w.document.write(html);
			w.document.close();
			w.focus();
			w.onload = () => w.print();
		}
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
				const f = saved.filters as {
					status?: StatusFilterValue;
					todayOnly?: boolean;
					dateFrom?: string;
					dateTo?: string;
					cashier?: string;
					createdByUserId?: string;
					cadeteId?: string;
					customerId?: string;
				};
				if (f.status && STATUS_OPTIONS.includes(f.status as StatusFilterValue))
					statusFilter = f.status as StatusFilterValue;
				// todayOnly no se restaura: al abrir /orders siempre se muestran solo los de hoy
				if (typeof f.dateFrom === 'string') filterDateFrom = f.dateFrom;
				if (typeof f.dateTo === 'string') filterDateTo = f.dateTo;
				if (typeof f.cashier === 'string') filterCashier = f.cashier;
				if (typeof f.createdByUserId === 'string') filterCreatedByUserId = f.createdByUserId;
				if (typeof f.cadeteId === 'string') filterCadeteId = f.cadeteId;
				if (typeof f.customerId === 'string') filterCustomerId = f.customerId;
			}
			if (saved?.columnVisibility && Object.keys(saved.columnVisibility).length)
				columnVisibility = { ...columnVisibility, ...saved.columnVisibility };
			const sort = (saved as { sorting?: { column?: SortColumn; dir?: 'asc' | 'desc' } })?.sorting;
			if (sort?.column && ORDER_TABLE_COLUMNS.some((c) => c.id === sort.column)) {
				sortColumn = sort.column;
				if (sort.dir === 'asc' || sort.dir === 'desc') sortDir = sort.dir;
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
		<div class="space-y-3">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<div class="flex flex-wrap items-center gap-2">
					<button
						type="button"
						class="rounded-md border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 {todayOnly
							? 'border-slate-800 bg-slate-800 text-white hover:bg-slate-700 dark:border-slate-600 dark:bg-slate-600 dark:hover:bg-slate-500'
							: 'border-slate-400 text-slate-700 hover:bg-slate-100 dark:border-slate-500 dark:text-slate-300 dark:hover:bg-slate-700'}"
						aria-pressed={todayOnly}
						onclick={() => {
							todayOnly = !todayOnly;
							pageIndex = 0;
							persist();
						}}
					>
						Hoy
					</button>
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
					<!-- Tomado por: usuarios con cuenta (team_members) -->
					<div class="relative" role="group" aria-label="Tomado por">
						<button
							type="button"
							class="rounded-md border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 {filterCreatedByUserId
								? 'border-slate-700 bg-slate-800 text-white dark:border-slate-600 dark:bg-slate-600'
								: 'border-slate-400 text-slate-700 hover:bg-slate-50 dark:border-slate-500 dark:text-slate-300 dark:hover:bg-slate-800'}"
							aria-haspopup="listbox"
							aria-expanded={tomadoPorDropdownOpen}
							onclick={() => {
								tomadoPorDropdownOpen = !tomadoPorDropdownOpen;
								asignadoADropdownOpen = false;
								fechasDropdownOpen = false;
							}}
						>
							{filterCreatedByUserId ? ($staffStore.find((s) => s.id === filterCreatedByUserId)?.name ?? 'Tomado por') : 'Tomado por'} ▾
						</button>
						{#if tomadoPorDropdownOpen}
							<button
								type="button"
								class="fixed inset-0 z-10 cursor-default"
								aria-label="Cerrar"
								onclick={() => (tomadoPorDropdownOpen = false)}
							></button>
							<div
								class="absolute left-0 top-full z-20 mt-1 max-h-48 w-48 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-neutral-600 dark:bg-neutral-900"
								role="listbox"
							>
								<button
									type="button"
									role="option"
									class="flex w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-neutral-700 {!filterCreatedByUserId
										? 'bg-slate-100 font-medium dark:bg-neutral-700'
										: ''}"
									onclick={() => {
										filterCreatedByUserId = '';
										tomadoPorDropdownOpen = false;
										pageIndex = 0;
										persist();
									}}
								>
									Todos
								</button>
								{#each $staffStore as staffMember}
									<button
										type="button"
										role="option"
										class="flex w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-neutral-700 {filterCreatedByUserId === staffMember.id
											? 'bg-slate-100 font-medium dark:bg-neutral-700'
											: ''}"
										onclick={() => {
											filterCreatedByUserId = staffMember.id;
											tomadoPorDropdownOpen = false;
											pageIndex = 0;
											persist();
										}}
									>
										{staffMember.name}
									</button>
								{/each}
							</div>
						{/if}
					</div>
					<!-- Asignado a -->
					<div class="relative" role="group" aria-label="Asignado a">
						<button
							type="button"
							class="rounded-md border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 {filterCadeteId
								? 'border-slate-700 bg-slate-800 text-white dark:border-slate-600 dark:bg-slate-600'
								: 'border-slate-400 text-slate-700 hover:bg-slate-50 dark:border-slate-500 dark:text-slate-300 dark:hover:bg-slate-800'}"
							aria-haspopup="listbox"
							aria-expanded={asignadoADropdownOpen}
							onclick={() => {
								asignadoADropdownOpen = !asignadoADropdownOpen;
								tomadoPorDropdownOpen = false;
								fechasDropdownOpen = false;
							}}
						>
							{filterCadeteId ? (cadetes.find((c) => c.id === filterCadeteId)?.name ?? 'Asignado a') : 'Asignado a'} ▾
						</button>
						{#if asignadoADropdownOpen}
							<button
								type="button"
								class="fixed inset-0 z-10 cursor-default"
								aria-label="Cerrar"
								onclick={() => (asignadoADropdownOpen = false)}
							></button>
							<div
								class="absolute left-0 top-full z-20 mt-1 max-h-48 w-48 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-neutral-600 dark:bg-neutral-900"
								role="listbox"
							>
								<button
									type="button"
									role="option"
									class="flex w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-neutral-700 {!filterCadeteId
										? 'bg-slate-100 font-medium dark:bg-neutral-700'
										: ''}"
									onclick={() => {
										filterCadeteId = '';
										asignadoADropdownOpen = false;
										pageIndex = 0;
										persist();
									}}
								>
									Todos
								</button>
								{#each cadetes as cadete}
									<button
										type="button"
										role="option"
										class="flex w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-neutral-700 {filterCadeteId === cadete.id
											? 'bg-slate-100 font-medium dark:bg-neutral-700'
											: ''}"
										onclick={() => {
											filterCadeteId = cadete.id;
											asignadoADropdownOpen = false;
											pageIndex = 0;
											persist();
										}}
									>
										{cadete.name}
									</button>
								{/each}
							</div>
						{/if}
					</div>
				</div>
				<div class="flex items-center gap-2">
					<!-- Fechas: icono calendario a la izquierda del filtro -->
					<div class="relative" role="group" aria-label="Filtrar por fecha">
						<button
							type="button"
							class="flex h-9 w-9 items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 {filterDateFrom || filterDateTo
								? 'border-slate-700 bg-slate-800 text-white dark:border-slate-600 dark:bg-slate-600'
								: 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-900'}"
							aria-haspopup="dialog"
							aria-expanded={fechasDropdownOpen}
							title={fechasButtonLabel}
							onclick={() => {
								fechasDropdownOpen = !fechasDropdownOpen;
								tomadoPorDropdownOpen = false;
								asignadoADropdownOpen = false;
							}}
						>
							<svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
								<path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
							</svg>
						</button>
						{#if fechasDropdownOpen}
							<button
								type="button"
								class="fixed inset-0 z-10 cursor-default"
								aria-label="Cerrar calendario"
								onclick={() => (fechasDropdownOpen = false)}
							></button>
							<div
								class="absolute right-0 top-full z-20 mt-1 w-[320px] min-w-[320px] rounded-lg border border-slate-200 bg-white p-4 shadow-lg dark:border-neutral-600 dark:bg-neutral-900"
								role="dialog"
								aria-label="Elegir fecha o rango"
							>
								<p class="mb-3 text-xs text-slate-500 dark:text-slate-400">Un día o rango (clic en inicio y fin).</p>
								<RangeCalendar.Root
									weekdayFormat="short"
									locale="es-AR"
									calendarLabel="Filtrar por fecha"
									value={dateRangeValue}
									onValueChange={(range) => {
										filterDateFrom = calendarDateToYmd(range?.start);
										filterDateTo = calendarDateToYmd(range?.end);
										pageIndex = 0;
										persist();
									}}
									class="w-full"
								>
									{#snippet children({ months, weekdays })}
										<RangeCalendar.Header class="mb-3 flex items-center justify-between">
											<RangeCalendar.PrevButton
												class="rounded p-2 text-slate-600 hover:bg-slate-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
												aria-label="Mes anterior"
											>
												<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" /></svg>
											</RangeCalendar.PrevButton>
											<RangeCalendar.Heading class="text-sm font-medium text-slate-800 dark:text-neutral-100" />
											<RangeCalendar.NextButton
												class="rounded p-2 text-slate-600 hover:bg-slate-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
												aria-label="Mes siguiente"
											>
												<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
											</RangeCalendar.NextButton>
										</RangeCalendar.Header>
										{#each months as month (month.value.month)}
											<RangeCalendar.Grid class="w-full border-collapse select-none">
												<RangeCalendar.GridHead>
													<RangeCalendar.GridRow class="mb-1 grid w-full grid-cols-7 gap-0.5">
														{#each weekdays as day (day)}
															<RangeCalendar.HeadCell class="flex h-8 min-w-[2rem] items-center justify-center text-xs font-normal text-slate-500 dark:text-slate-400">
																{day.slice(0, 2)}
															</RangeCalendar.HeadCell>
														{/each}
													</RangeCalendar.GridRow>
												</RangeCalendar.GridHead>
												<RangeCalendar.GridBody>
													{#each month.weeks as weekDates, i (i)}
														<RangeCalendar.GridRow class="grid w-full grid-cols-7 gap-0.5">
															{#each weekDates as date, d (d)}
																<RangeCalendar.Cell {date} month={month.value} class="relative flex min-w-[2rem] p-0 text-center text-sm">
																	<RangeCalendar.Day
																		class="flex h-9 w-full min-w-[2.25rem] items-center justify-center rounded-md border border-transparent hover:bg-slate-100 hover:text-slate-900 data-[selected]:border-slate-800 data-[selected]:bg-slate-800 data-[selected]:text-white data-[selection-start]:rounded-l-md data-[selection-end]:rounded-r-md data-[highlighted]:bg-slate-100 data-[disabled]:text-slate-400 dark:hover:bg-neutral-800 dark:data-[selected]:bg-slate-600 dark:data-[highlighted]:bg-neutral-800"
																	>
																		{date.day}
																	</RangeCalendar.Day>
																</RangeCalendar.Cell>
															{/each}
														</RangeCalendar.GridRow>
													{/each}
												</RangeCalendar.GridBody>
											</RangeCalendar.Grid>
										{/each}
									{/snippet}
								</RangeCalendar.Root>
							</div>
						{/if}
					</div>
					<button
						type="button"
						class="relative flex h-9 w-9 items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 {activeFilterCount > 0
							? 'border-slate-700 bg-slate-800 text-white hover:bg-slate-700 dark:border-slate-600 dark:bg-slate-600 dark:hover:bg-slate-500'
							: 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-900'}"
						aria-label={activeFilterCount > 0 ? `Limpiar ${activeFilterCount} filtro(s)` : 'Limpiar filtros'}
						title={activeFilterCount > 0 ? `Limpiar filtros (${activeFilterCount} activos)` : 'Limpiar filtros'}
						onclick={() => clearFilters()}
					>
						<svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true">
							<path stroke-linecap="round" stroke-linejoin="round" d="M3 4.5h18l-5.5 7v5.5l-4-2v-3.5L3 4.5z" />
						</svg>
						{#if activeFilterCount > 0}
							<span class="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-slate-900 px-1 text-[10px] font-semibold text-white dark:bg-white dark:text-slate-900">
								{activeFilterCount > 9 ? '9+' : activeFilterCount}
							</span>
						{/if}
					</button>
				</div>
			</div>
		</div>
	</div>

	{#if selectedOrderIds.size > 0}
		<div class="panel flex flex-wrap items-center gap-3 p-3">
			<span class="text-sm text-slate-600 dark:text-slate-400">{selectedOrderIds.size} seleccionado(s)</span>
			{#if !hasMixedStatuses && selectedNoAsignadoIds.length > 0}
				<div class="relative" role="group" aria-label="Asignar a">
					<button
						type="button"
						class="btn-secondary !py-1.5 text-xs"
						aria-haspopup="listbox"
						aria-expanded={bulkAssignOpen}
						onclick={() => (bulkAssignOpen = !bulkAssignOpen)}
						onkeydown={(e) => e.key === 'Escape' && (bulkAssignOpen = false)}
					>
						Asignar a
					</button>
					{#if bulkAssignOpen}
						<button
							type="button"
							class="fixed inset-0 z-10 cursor-default"
							aria-label="Cerrar asignar a"
							onclick={() => (bulkAssignOpen = false)}
						></button>
						<div
							class="absolute left-0 top-full z-20 mt-1 max-h-56 w-48 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-neutral-600 dark:bg-black"
							role="listbox"
						>
							{#each cadetes as cadete}
								<button
									type="button"
									role="option"
									class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-neutral-700"
									onclick={() => bulkAssign(cadete)}
								>
									{cadete.name}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
			{#if !hasMixedStatuses && selectedAsignadoIds.length > 0}
				<button type="button" class="btn-primary !py-1.5 text-xs" onclick={() => bulkComplete()}>
					Marcar como Completado
				</button>
				<button type="button" class="btn-secondary !py-1.5 text-xs" onclick={() => bulkUnassign()}>
					Quitar asignación
				</button>
			{/if}
			{#if !hasMixedStatuses && selectedDeletableIds.length > 0 && selectedDeletableIds.length === selectedOrderIds.size}
				<button type="button" class="btn-danger !py-1.5 text-xs" onclick={() => (bulkDeleteConfirmOpen = true)}>
					Eliminar
				</button>
			{/if}
			<button type="button" class="btn-danger !py-1.5 text-xs" onclick={() => (bulkCancelConfirmOpen = true)}>
				Marcar como Cancelado
			</button>
			<button type="button" class="btn-secondary !py-1.5 text-xs" onclick={() => (selectedOrderIds = new Set())}>
				Desmarcar
			</button>
		</div>
	{/if}

	<div class="panel p-4">
		<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
			<label for="pedidos-search" class="sr-only">Buscar</label>
			<input
				id="pedidos-search"
				class="input max-w-md"
				placeholder="Buscar por número, teléfono, dirección o cliente"
				bind:value={query}
				oninput={() => {
					pageIndex = 0;
					persist();
				}}
			/>
			<div class="relative" role="group" aria-label="Columnas visibles">
				<button
					type="button"
					class="rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-900"
					aria-haspopup="listbox"
					aria-expanded={columnVisibilityOpen}
					onclick={() => (columnVisibilityOpen = !columnVisibilityOpen)}
					onkeydown={(e) => e.key === 'Escape' && (columnVisibilityOpen = false)}
				>
					Columnas
				</button>
				{#if columnVisibilityOpen}
					<div
						class="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-neutral-600 dark:bg-black"
						role="listbox"
					>
						{#each ORDER_TABLE_COLUMNS as col}
							<button
								type="button"
								role="option"
								aria-selected={isColumnVisible(col.id)}
								class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700"
								onclick={() => toggleColumnVisibility(col.id)}
							>
								<span class="flex h-4 w-4 items-center justify-center rounded border">
									{#if isColumnVisible(col.id)}
										✓
									{/if}
								</span>
								{col.header}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>
		{#if !browser || !table}
			<p class="py-8 text-center text-sm text-slate-500 dark:text-slate-400">Cargando tabla…</p>
		{:else}
			<table class="min-w-full text-sm">
				<thead class="bg-slate-50 dark:bg-neutral-900">
					<tr>
						<th class="w-10 px-2 py-2 text-center align-middle">
							<input
								type="checkbox"
								class="rounded border-slate-300"
								checked={paginatedRows.length > 0 && paginatedRows.every((r) => selectedOrderIds.has(r.original.id))}
								onchange={() => toggleSelectAllOnPage()}
								aria-label="Seleccionar todos"
							/>
						</th>
						{#if isColumnVisible('num')}
							<th
								class="cursor-pointer px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-neutral-800"
								onclick={() => setSort('num')}
								scope="col"
							>Nº<span class="ml-1">{SortIcon('num')}</span></th>
						{/if}
						{#if isColumnVisible('fecha')}
							<th
								class="cursor-pointer px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-neutral-800"
								onclick={() => setSort('fecha')}
								scope="col"
							>Fecha<span class="ml-1">{SortIcon('fecha')}</span></th>
						{/if}
						{#if isColumnVisible('cliente')}
							<th
								class="cursor-pointer px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-neutral-800"
								onclick={() => setSort('cliente')}
								scope="col"
							>Cliente<span class="ml-1">{SortIcon('cliente')}</span></th>
						{/if}
						{#if isColumnVisible('direccion')}
							<th
								class="cursor-pointer px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-neutral-800"
								onclick={() => setSort('direccion')}
								scope="col"
							>Dirección<span class="ml-1">{SortIcon('direccion')}</span></th>
						{/if}
						{#if isColumnVisible('total')}
							<th
								class="cursor-pointer px-3 py-2 text-right font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-neutral-800"
								onclick={() => setSort('total')}
								scope="col"
							>Total<span class="ml-1">{SortIcon('total')}</span></th>
						{/if}
						{#if isColumnVisible('estado')}
							<th
								class="cursor-pointer px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-neutral-800"
								onclick={() => setSort('estado')}
								scope="col"
							>Estado<span class="ml-1">{SortIcon('estado')}</span></th>
						{/if}
						{#if isColumnVisible('cadete')}
							<th
								class="cursor-pointer px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-neutral-800"
								onclick={() => setSort('cadete')}
								scope="col"
							>Cadete<span class="ml-1">{SortIcon('cadete')}</span></th>
						{/if}
						<th class="w-12 px-2 py-2 text-right" scope="col"><span class="sr-only">Acciones</span></th>
					</tr>
				</thead>
				<tbody>
					{#each paginatedRows as row}
						{@const order = row.original}
						<tr class="border-t border-slate-100 hover:bg-slate-50 dark:border-neutral-800 dark:hover:bg-neutral-900/60">
							<td class="w-10 px-2 py-2 text-center align-middle">
								<input
									type="checkbox"
									class="rounded border-slate-300"
									checked={selectedOrderIds.has(order.id)}
									onchange={() => toggleSelectOrder(order.id)}
									aria-label="Seleccionar pedido #{order.orderNumber}"
								/>
							</td>
							{#if isColumnVisible('num')}
								<td class="whitespace-nowrap px-3 py-2">{formatOrderNumber(order.orderNumber)}</td>
							{/if}
							{#if isColumnVisible('fecha')}
								<td class="whitespace-nowrap px-3 py-2">{formatDateTime(order.createdAt)}</td>
							{/if}
							{#if isColumnVisible('cliente')}
								<td class="whitespace-nowrap px-3 py-2">{order.customerPhoneSnapshot}</td>
							{/if}
							{#if isColumnVisible('direccion')}
								<td class="max-w-[180px] truncate px-3 py-2" title={order.addressSnapshot}>{order.addressSnapshot}</td>
							{/if}
							{#if isColumnVisible('total')}
								<td class="whitespace-nowrap px-3 py-2 text-right">{formatMoney(order.total)}</td>
							{/if}
							{#if isColumnVisible('estado')}
								<td class="whitespace-nowrap px-3 py-2"><StatusBadge status={order.status} /></td>
							{/if}
							{#if isColumnVisible('cadete')}
								<td class="whitespace-nowrap px-3 py-2">{getCadeteName(order)}</td>
							{/if}
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
										{#if order.status !== 'BORRADOR'}
											<button
												type="button"
												class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-neutral-700"
												role="menuitem"
												onclick={() => {
													printOrder(order);
													orderMenuOpenId = null;
												}}
											>
												<svg class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
													<path stroke-linecap="round" stroke-linejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
												</svg>
												Imprimir
											</button>
										{/if}
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
											<button
												type="button"
												class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-neutral-700"
												role="menuitem"
												onclick={() => {
													ordersStore.unassign(order.id);
													orderMenuOpenId = null;
												}}
											>
												Quitar asignación
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
										{#if order.status === 'BORRADOR' || order.status === 'CANCELADO'}
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
			{#if columnVisibilityOpen}
				<button
					type="button"
					class="fixed inset-0 z-10 cursor-default"
					aria-label="Cerrar columnas"
					onclick={() => (columnVisibilityOpen = false)}
				></button>
			{/if}
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
				El pedido se eliminará definitivamente. Solo se pueden eliminar borradores o pedidos cancelados. ¿Querés continuar?
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

{#if bulkCancelConfirmOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="bulk-cancel-title">
		<div class="max-w-sm rounded-xl bg-white p-4 shadow-xl dark:bg-neutral-800">
			<h2 id="bulk-cancel-title" class="text-base font-semibold">¿Marcar como cancelados?</h2>
			<p class="mt-2 text-sm text-slate-600 dark:text-slate-400">
				¿Está seguro que desea pasar los {selectedOrderIds.size} pedido(s) seleccionado(s) a estado Cancelado?
			</p>
			<div class="mt-4 flex justify-end gap-2">
				<button type="button" class="btn-secondary" onclick={() => (bulkCancelConfirmOpen = false)}>
					No
				</button>
				<button type="button" class="btn-danger" onclick={() => bulkCancel()}>
					Sí, marcar como cancelados
				</button>
			</div>
		</div>
	</div>
{/if}

{#if bulkDeleteConfirmOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="bulk-delete-title">
		<div class="max-w-sm rounded-xl bg-white p-4 shadow-xl dark:bg-neutral-800">
			<h2 id="bulk-delete-title" class="text-base font-semibold">¿Eliminar pedidos?</h2>
			<p class="mt-2 text-sm text-slate-600 dark:text-slate-400">
				Se eliminarán {selectedDeletableIds.length} pedido(s) (borradores y cancelados). Esta acción no se puede deshacer. ¿Continuar?
			</p>
			<div class="mt-4 flex justify-end gap-2">
				<button type="button" class="btn-secondary" onclick={() => (bulkDeleteConfirmOpen = false)}>
					No
				</button>
				<button type="button" class="btn-danger" onclick={() => confirmBulkDelete()}>
					Sí, eliminar
				</button>
			</div>
		</div>
	</div>
{/if}

<SideDrawer bind:open={drawerOpen} title="Detalle del pedido" maxWidth="500px">
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
					<dd class="text-xs">#{formatOrderNumber(selectedOrder.orderNumber)}</dd>
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

<!-- Drawer de filtros eliminado: el icono de filtro ahora limpia los filtros -->
