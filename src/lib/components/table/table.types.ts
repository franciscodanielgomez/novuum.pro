import type { ColumnDef, SortingState } from '@tanstack/table-core';

export interface DataTableColumn<TData, TValue = unknown> {
	id: string;
	header: string;
	accessorKey?: keyof TData | string;
	accessorFn?: (row: TData) => TValue;
	cell?: (row: TData) => string | number | boolean | null | undefined;
	enableSorting?: boolean;
	enableHiding?: boolean;
	visible?: boolean;
}

export interface GlobalSearchConfig<TData> {
	placeholder?: string;
	keys: (keyof TData | string)[];
	debounceMs?: number;
}

export type DataTableFilterType = 'chips' | 'date' | 'select';

export interface DataTableFilterBase<TData, TValue = unknown> {
	id: string;
	label: string;
	accessor: (row: TData) => TValue;
}

export interface DataTableFilterChips<TData, TValue = string> extends DataTableFilterBase<TData, TValue> {
	type: 'chips';
	options: { value: TValue; label: string }[];
}

export interface DataTableFilterDate<TData> extends DataTableFilterBase<TData, string> {
	type: 'date';
}

export interface DataTableFilterSelect<TData, TValue = string> extends DataTableFilterBase<TData, TValue> {
	type: 'select';
	options: { value: TValue; label: string }[];
}

export type DataTableFilter<TData> =
	| DataTableFilterChips<TData>
	| DataTableFilterDate<TData>
	| DataTableFilterSelect<TData>;

export type DataTableActionVariant = 'default' | 'success' | 'danger' | 'secondary';

export type DataTableActionIcon = 'edit' | 'trash' | 'plus';

export interface DataTableAction<TData> {
	label: string;
	onClick: (row: TData) => void;
	variant?: DataTableActionVariant;
	/** Si se define, se muestra solo el icono (label se usa para aria-label y title) */
	icon?: DataTableActionIcon;
}

export interface DataTableInitialState {
	pageSize?: number;
	sorting?: SortingState;
	columnVisibility?: Record<string, boolean>;
	columnOrder?: string[];
}

export interface DataTablePersistedState {
	globalFilter?: string;
	sorting?: SortingState;
	columnVisibility?: Record<string, boolean>;
	columnOrder?: string[];
	pagination?: { pageIndex: number; pageSize: number };
	filters?: Record<string, unknown>;
}

export interface DataTableProps<TData> {
	tableId: string;
	title?: string;
	data: TData[];
	columns: DataTableColumn<TData>[];
	rowId: (row: TData) => string;
	globalSearch?: GlobalSearchConfig<TData>;
	filters?: DataTableFilter<TData>[];
	actions?: DataTableAction<TData>[];
	initialState?: DataTableInitialState;
	enableVirtualization?: boolean;
	pageSizeOptions?: number[];
	loading?: boolean;
	emptyMessage?: string;
	persistState?: boolean;
}

export type { ColumnDef, SortingState };
