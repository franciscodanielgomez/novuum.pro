<script lang="ts">
	/** Reutiliza el paginador estándar de la tabla (Melt UI: Primero | Anterior | números | Siguiente | Último). */
	import DataTablePaginator from '$lib/components/table/DataTablePaginator.svelte';

	type Props = {
		totalRows: number;
		pageSize: number;
		pageIndex: number;
		pageCount: number;
		pageSizeOptions?: number[];
		onPageIndexChange: (index: number) => void;
		onPageSizeChange: (size: number) => void;
	};
	let {
		totalRows,
		pageSize,
		pageIndex,
		pageCount,
		pageSizeOptions = [10, 20, 50, 100],
		onPageIndexChange,
		onPageSizeChange
	}: Props = $props();
</script>

<DataTablePaginator
	{totalRows}
	{pageSize}
	{pageIndex}
	{pageCount}
	{pageSizeOptions}
	{onPageIndexChange}
	{onPageSizeChange}
/>
