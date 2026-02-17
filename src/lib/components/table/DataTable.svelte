<script lang="ts" generics="TData">
	import {
		createTable,
		getCoreRowModel,
		getSortedRowModel,
		getPaginationRowModel,
		type ColumnDef,
		type Table
	} from '@tanstack/table-core';
	import { loadTableState, saveTableState } from './table.state';
	import { applyGlobalSearch, applyFilter, debounce } from './table.utils';
	import type {
		DataTableColumn,
		DataTableFilter,
		DataTableAction,
		DataTableProps,
		DataTablePersistedState,
		DataTableFilterChips,
		DataTableFilterDate,
		DataTableFilterSelect
	} from './table.types';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import DataTablePaginator from './DataTablePaginator.svelte';

	type Props = DataTableProps<TData>;

	let {
		tableId,
		title = '',
		data = [],
		columns = [],
		rowId,
		globalSearch,
		filters = [],
		actions = [],
		initialState = {},
		pageSizeOptions = [10, 20, 50, 100],
		loading = false,
		emptyMessage = 'Sin resultados',
		persistState = true
	}: Props = $props();

	// Use only initialState for first render so server and client match (no localStorage during SSR).
	const defaultPageSize = initialState?.pageSize ?? 20;
	const defaultSorting = initialState?.sorting ?? [];
	const defaultColumnVisibility = (() => {
		const base = { ...(initialState?.columnVisibility ?? {}) };
		for (const col of columns) {
			if (col.visible === false) base[col.id] = false;
		}
		return base;
	})();
	const defaultColumnOrder = initialState?.columnOrder;
	const defaultColumnOrderResolved = defaultColumnOrder ?? columns.map((c) => c.id).concat(actions.length ? ['__actions__'] : []);

	let globalSearchInput = $state('');
	let filterValues = $state<Record<string, unknown>>({});
	let columnVisibility = $state<Record<string, boolean>>(defaultColumnVisibility);
	let columnOrder = $state<string[] | undefined>(defaultColumnOrder);
	let sorting = $state(defaultSorting);
	let pagination = $state({
		pageIndex: 0,
		pageSize: defaultPageSize
	});

	// Apply persisted state only on client after mount to avoid hydration mismatch.
	onMount(() => {
		if (!persistState || typeof window === 'undefined') return;
		const saved = loadTableState(tableId);
		if (!saved) return;
		if (saved.globalFilter !== undefined) globalSearchInput = saved.globalFilter;
		if (saved.filters && Object.keys(saved.filters).length) filterValues = saved.filters as Record<string, unknown>;
		if (saved.sorting?.length) sorting = saved.sorting;
		if (saved.columnVisibility && Object.keys(saved.columnVisibility).length) columnVisibility = { ...columnVisibility, ...saved.columnVisibility };
		if (saved.columnOrder?.length) columnOrder = saved.columnOrder;
		if (saved.pagination) pagination = { ...pagination, ...saved.pagination };
	});

	const debounceMs = globalSearch?.debounceMs ?? 200;

	// Apply external filters (chips, date, select) and global search in one pass over data
	const filteredData = $derived.by(() => {
		let rows = Array.isArray(data) ? data : [];
		const q = String(globalSearchInput).trim();
		if (globalSearch && q) {
			rows = applyGlobalSearch(rows, q, globalSearch.keys);
		}
		for (const f of filters) {
			const v = filterValues[f.id];
			if (v !== undefined && v !== null && v !== '') {
				rows = applyFilter(rows, f.id, v, f.accessor);
			}
		}
		return rows;
	});


	function buildColumnDefs(): ColumnDef<TData, unknown>[] {
		const defs: ColumnDef<TData, unknown>[] = columns.map((col) => {
			const base: Record<string, unknown> = {
				id: col.id,
				header: col.header,
				enableSorting: col.enableSorting !== false,
				enableHiding: col.enableHiding !== false
			};
			if (col.accessorFn) {
				base.accessorFn = col.accessorFn as (row: TData, index: number) => unknown;
			} else if (col.accessorKey) {
				base.accessorKey = col.accessorKey as string;
			}
			if (col.cell) {
				base.cell = (info: { row: { original: TData } }) => {
					const row = info.row.original;
					const v = col.cell!(row);
					return v == null ? '—' : String(v);
				};
			}
			return base as unknown as ColumnDef<TData, unknown>;
		});
		if (actions.length > 0) {
			defs.push({
				id: '__actions__',
				header: 'Acciones',
				enableSorting: false,
				enableHiding: false,
				enableGlobalFilter: false,
				cell: (info) => {
					const row = info.row.original as TData;
					return ''; // Rendered in slot
				}
			} as ColumnDef<TData, unknown>);
		}
		return defs;
	}

	const columnDefs = $derived(buildColumnDefs());

	// columnPinning debe existir para que getHeaderGroups() no falle leyendo .columnPinning.left (TanStack Table).
	const defaultColumnPinning = { left: [], right: [] };
	const tableState = $derived({
		sorting,
		columnVisibility,
		columnOrder: columnOrder ?? columns.map((c) => c.id).concat(actions.length ? ['__actions__'] : []),
		pagination,
		columnPinning: defaultColumnPinning
	});

	type TableStateSubset = { sorting: typeof sorting; columnVisibility: typeof columnVisibility; columnOrder: string[]; pagination: typeof pagination };
	const onStateChange = (updater: TableStateSubset | ((prev: TableStateSubset) => TableStateSubset)) => {
		const next = typeof updater === 'function' ? updater(tableState) : updater;
		if (next?.sorting !== undefined) sorting = next.sorting;
		if (next?.columnVisibility !== undefined) columnVisibility = next.columnVisibility;
		if (next?.columnOrder !== undefined) columnOrder = next.columnOrder;
		if (next?.pagination !== undefined) pagination = next.pagination;
		if (persistState) {
			saveTableState(tableId, {
				globalFilter: globalSearchInput,
				sorting,
				columnVisibility,
				columnOrder: columnOrder ?? undefined,
				pagination,
				filters: filterValues
			});
		}
	};

	// Only create table in browser to avoid SSR errors (TanStack Table may use DOM/globals).
	const table = $derived.by(() => {
		if (!browser) return null as unknown as Table<TData>;
		return createTable({
			data: filteredData,
			columns: columnDefs,
			getRowId: (row) => rowId(row as TData),
			getCoreRowModel: getCoreRowModel(),
			getSortedRowModel: getSortedRowModel(),
			getPaginationRowModel: getPaginationRowModel(),
			onStateChange: onStateChange as (updater: unknown) => void,
			state: tableState,
			renderFallbackValue: '',
			initialState: {
				sorting: defaultSorting,
				columnVisibility: defaultColumnVisibility,
				columnOrder: defaultColumnOrderResolved,
				pagination: { pageIndex: 0, pageSize: defaultPageSize },
				columnPinning: defaultColumnPinning
			}
		}) as Table<TData>;
	});

	const emptyRowModel = { rows: [], flatRows: [], rowsById: {} };
	const safeHeaderGroups = () => {
		if (!table) return [];
		try {
			return table.getHeaderGroups();
		} catch {
			return [];
		}
	};
	const rowModel = $derived(table ? table.getRowModel() : emptyRowModel);
	const headerGroups = $derived(safeHeaderGroups());
	const pageOptions = $derived(table ? table.getPageCount() : 0);
	const canPrev = $derived(table ? table.getCanPreviousPage() : false);
	const canNext = $derived(table ? table.getCanNextPage() : false);
	const pageIndex = $derived(table ? table.getState().pagination.pageIndex : 0);
	const pageSize = $derived(table ? table.getState().pagination.pageSize : defaultPageSize);
	const totalRows = $derived(filteredData.length);
	const from = $derived(totalRows === 0 ? 0 : pageIndex * pageSize + 1);
	const to = $derived(Math.min((pageIndex + 1) * pageSize, totalRows));

	const setGlobalSearch = debounce((...args: unknown[]) => {
		const value = args[0] as string;
		globalSearchInput = value;
		if (persistState) saveTableState(tableId, { ...loadTableState(tableId), globalFilter: value });
	}, debounceMs);

	const setFilter = (id: string, value: unknown) => {
		filterValues = { ...filterValues, [id]: value };
		if (persistState) saveTableState(tableId, { ...loadTableState(tableId), filters: { ...filterValues, [id]: value } });
	};

	function toggleColumnVisibility(columnId: string) {
		const next = !columnVisibility[columnId];
		columnVisibility = { ...columnVisibility, [columnId]: next };
		if (persistState) saveTableState(tableId, { ...loadTableState(tableId), columnVisibility: { ...columnVisibility, [columnId]: next } });
	}

	const visibleColumns = $derived(table ? table.getAllLeafColumns().filter((c) => c.getIsVisible()) : []);
	let columnVisibilityOpen = $state(false);
</script>

<div class="space-y-3">
	{#if !browser}
		<div class="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
			Cargando tabla…
		</div>
	{:else}
	{#if !table}
		<div class="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
			Cargando tabla…
		</div>
	{:else}
	{#if title}
		<h2 class="text-lg font-semibold text-slate-800 dark:text-neutral-200">{title}</h2>
	{/if}

	<div class="flex flex-wrap items-center gap-3">
		{#if globalSearch}
			<input
				type="search"
				class="input max-w-xs"
				placeholder={globalSearch.placeholder ?? 'Buscar…'}
				aria-label="Buscar en la tabla"
				value={globalSearchInput}
				oninput={(e) => {
					const v = (e.currentTarget as HTMLInputElement).value;
					globalSearchInput = v;
					setGlobalSearch(v);
				}}
			/>
		{/if}

		{#each filters as filter}
			{#if filter.type === 'chips'}
				{@const f = filter as DataTableFilterChips<TData>}
				<div class="flex flex-wrap items-center gap-1">
					<span class="text-xs font-medium text-slate-500 dark:text-neutral-400">{f.label}:</span>
					{#each f.options as opt}
						<button
							type="button"
							class="rounded-full border px-2 py-0.5 text-xs transition"
							class:border-slate-800={filterValues[f.id] === opt.value}
							class:bg-slate-800={filterValues[f.id] === opt.value}
							class:text-white={filterValues[f.id] === opt.value}
							class:border-slate-200={filterValues[f.id] !== opt.value}
							class:dark:border-neutral-600={filterValues[f.id] !== opt.value}
							onclick={() => setFilter(f.id, opt.value)}
						>
							{opt.label}
						</button>
					{/each}
				</div>
			{:else if filter.type === 'date'}
				{@const f = filter as DataTableFilterDate<TData>}
				<label class="flex items-center gap-1">
					<span class="text-xs font-medium text-slate-500 dark:text-neutral-400">{f.label}:</span>
					<input
						type="date"
						class="input !py-1 text-sm"
						aria-label={f.label}
						value={filterValues[f.id] as string ?? ''}
						oninput={(e) => setFilter(f.id, (e.currentTarget as HTMLInputElement).value || undefined)}
					/>
				</label>
			{:else if filter.type === 'select'}
				{@const f = filter as DataTableFilterSelect<TData>}
				<label class="flex items-center gap-1">
					<span class="text-xs font-medium text-slate-500 dark:text-neutral-400">{f.label}:</span>
					<select
						class="input !py-1 text-sm"
						aria-label={f.label}
						value={String(filterValues[f.id] ?? '')}
						onchange={(e) => setFilter(f.id, (e.currentTarget as HTMLSelectElement).value || undefined)}
					>
						<option value="">Todos</option>
						{#each f.options as opt}
							<option value={String(opt.value)}>{opt.label}</option>
						{/each}
					</select>
				</label>
			{/if}
		{/each}

		<div class="ml-auto flex items-center gap-2">
			<!-- Column visibility -->
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
						{#each table.getAllLeafColumns() as col}
							{#if col.id !== '__actions__'}
								<button
									type="button"
									role="option"
									aria-selected={col.getIsVisible()}
									class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700"
									onclick={() => {
										toggleColumnVisibility(col.id);
									}}
								>
									<span class="flex h-4 w-4 items-center justify-center rounded border">
										{#if col.getIsVisible()}
											✓
										{/if}
									</span>
									{col.columnDef.header as string}
								</button>
							{/if}
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>

	<div class="overflow-auto rounded-lg border border-slate-200 dark:border-neutral-800">
		<table class="min-w-full text-sm" role="grid">
			<thead class="sticky top-0 z-10 bg-slate-50 dark:bg-neutral-900">
				{#each headerGroups as headerGroup}
					<tr>
						{#each headerGroup.headers as header}
							{#if header.column.getIsVisible()}
								<th
									class="px-3 py-2 font-medium text-slate-600 dark:text-neutral-300"
									class:text-left={header.column.id !== '__actions__'}
									class:text-right={header.column.id === '__actions__'}
									class:cursor-pointer={header.column.getCanSort()}
									colspan={header.colSpan}
									scope="col"
									onclick={() => header.column.getCanSort() && header.column.toggleSorting(header.column.getIsSorted() === 'asc')}
								>
									{header.column.columnDef.header as string}
									{#if header.column.getCanSort()}
										<span class="ml-1">
											{header.column.getIsSorted() === 'asc' ? ' ↑' : header.column.getIsSorted() === 'desc' ? ' ↓' : ' ↕'}
										</span>
									{/if}
								</th>
							{/if}
						{/each}
					</tr>
				{/each}
			</thead>
			<tbody>
				{#if loading}
					<tr>
						<td colspan={visibleColumns.length} class="px-3 py-8 text-center text-slate-500 dark:text-neutral-400">
							Cargando…
						</td>
					</tr>
				{:else if rowModel.rows.length === 0}
					<tr>
						<td colspan={visibleColumns.length} class="px-3 py-8 text-center text-slate-500 dark:text-neutral-400">
							{emptyMessage}
						</td>
					</tr>
				{:else}
					{#each rowModel.rows as row}
						<tr class="border-t border-slate-100 hover:bg-slate-50 dark:border-neutral-800 dark:hover:bg-slate-800/40">
							{#each row.getVisibleCells() as cell}
								{#if cell.column.id === '__actions__'}
									<td class="px-3 py-2 text-right">
										<div class="flex flex-wrap items-center justify-end gap-1">
											{#each actions as action}
												{@const variant = action.variant ?? 'default'}
												<button
													type="button"
													title={action.label}
													aria-label={action.label}
													class="inline-flex h-8 w-8 items-center justify-center rounded border transition {variant === 'success'
														? 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700'
														: variant === 'danger'
															? 'border-red-300 bg-red-600 text-white hover:bg-red-700'
															: variant === 'secondary'
																? 'border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800'
																: 'border-slate-300 text-slate-700 hover:bg-slate-100'}"
													onclick={() => action.onClick(row.original as TData)}
												>
													{#if action.icon === 'edit'}
														<svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
															<path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
														</svg>
													{:else if action.icon === 'trash'}
														<svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
															<path stroke-linecap="round" stroke-linejoin="round" d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m-3 0h6" />
														</svg>
													{:else if action.icon === 'plus'}
														<svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
															<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
														</svg>
													{:else}
														<span class="text-xs">{action.label}</span>
													{/if}
												</button>
											{/each}
										</div>
									</td>
								{:else}
									<td class="whitespace-nowrap px-3 py-2">{cell.getValue() != null ? String(cell.getValue()) : '—'}</td>
								{/if}
							{/each}
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>

	<div class="mt-4">
		<DataTablePaginator
			totalRows={totalRows}
			pageSize={pagination.pageSize}
			pageIndex={pagination.pageIndex}
			pageCount={Math.max(1, pageOptions)}
			pageSizeOptions={pageSizeOptions}
			onPageIndexChange={(idx) => {
				pagination = { ...pagination, pageIndex: idx };
				if (persistState) saveTableState(tableId, { ...loadTableState(tableId), pagination });
			}}
			onPageSizeChange={(size) => {
				pagination = { pageIndex: 0, pageSize: size };
				if (persistState) saveTableState(tableId, { ...loadTableState(tableId), pagination });
			}}
		/>
	</div>
	{/if}
	{/if}
</div>
