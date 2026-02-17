<script lang="ts">
	/**
	 * Paginador reutilizable (Melt UI): « Primero | ‹ Anterior | números | Siguiente › | Último »
	 * + "Página X de Y" + selector de tamaño. Usado por DataTable y por tablas custom (productos, pedidos).
	 */
	import { createPagination } from '@melt-ui/svelte';
	import { writable } from 'svelte/store';
	import { browser } from '$app/environment';

	type PageItem = { type: string; value?: number; key: string };

	type Props = {
		totalRows: number;
		pageSize: number;
		pageIndex: number; // 0-based (TanStack)
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

	const pageStore = writable(Math.max(1, Math.min(pageIndex + 1, Math.max(1, pageCount))));

	const pagination = $derived.by(() => {
		if (!browser) return null;
		return createPagination({
			count: totalRows,
			perPage: pageSize,
			siblingCount: 1,
			page: pageStore,
			onPageChange: (details: { curr: number; next: number }) => {
				onPageIndexChange(details.next - 1);
				return details.next;
			}
		});
	});

	$effect(() => {
		if (!browser || !pagination) return;
		const oneBased = Math.max(1, Math.min(pageIndex + 1, Math.max(1, pageCount)));
		pageStore.set(oneBased);
	});

	let pagesList = $state<PageItem[]>([]);
	$effect(() => {
		const p = pagination;
		if (!p?.states?.pages?.subscribe) {
			pagesList = [];
			return;
		}
		const unsub = p.states.pages.subscribe((v) => {
			pagesList = Array.isArray(v) ? (v as PageItem[]) : [];
		});
		return () => unsub();
	});

	const currentPageOneBased = $derived(Math.max(1, Math.min(pageIndex + 1, Math.max(1, pageCount))));
	const canFirst = $derived(pageIndex > 0);
	const canPrev = $derived(pageIndex > 0);
	const canNext = $derived(pageCount > 1 && pageIndex < pageCount - 1);
	const canLast = $derived(pageCount > 1 && pageIndex < pageCount - 1);
</script>

{#if browser && pagination}
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div class="flex flex-wrap items-center gap-4">
			<span class="text-sm text-slate-600 dark:text-slate-400">
				Página {currentPageOneBased} de {Math.max(1, pageCount)}
			</span>
			<label class="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400">
				<span>Mostrar</span>
				<select
					class="input !w-16 !py-1 text-sm"
					aria-label="Filas por página"
					value={pageSize}
					onchange={(e) => onPageSizeChange(Number((e.currentTarget as HTMLSelectElement).value))}
				>
					{#each pageSizeOptions as n}
						<option value={n}>{n}</option>
					{/each}
				</select>
			</label>
		</div>
		<nav class="flex flex-wrap items-center gap-1" aria-label="Paginación" data-scope="pagination">
			<button
				type="button"
				class="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-slate-200 px-2 text-sm font-medium text-slate-700 transition disabled:pointer-events-none disabled:opacity-50 hover:bg-slate-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
				aria-label="Primera página"
				disabled={!canFirst}
				onclick={() => onPageIndexChange(0)}
			>« Primero</button>
			<button
				type="button"
				class="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-slate-200 px-2 text-sm font-medium text-slate-700 transition disabled:pointer-events-none disabled:opacity-50 hover:bg-slate-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
				aria-label="Página anterior"
				disabled={!canPrev}
				onclick={() => onPageIndexChange(Math.max(0, pageIndex - 1))}
			>‹ Anterior</button>
			{#each pagesList as item (item.key)}
				{#if item.type === 'ellipsis'}
					<span class="inline-flex h-9 min-w-9 items-center justify-center text-slate-500 dark:text-slate-400">…</span>
				{:else if item.value != null}
					<button
						type="button"
						class="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border text-sm font-medium transition disabled:pointer-events-none disabled:opacity-50"
						class:border-slate-800={item.value === currentPageOneBased}
						class:bg-slate-800={item.value === currentPageOneBased}
						class:text-white={item.value === currentPageOneBased}
						class:border-slate-200={item.value !== currentPageOneBased}
						class:text-slate-700={item.value !== currentPageOneBased}
						class:hover:bg-slate-50={item.value !== currentPageOneBased}
						class:dark:border-neutral-700={item.value !== currentPageOneBased}
						class:dark:text-neutral-300={item.value !== currentPageOneBased}
						class:dark:hover:bg-neutral-900={item.value !== currentPageOneBased}
						aria-label="Página {item.value}"
						onclick={() => onPageIndexChange(item.value! - 1)}
					>{item.value}</button>
				{/if}
			{/each}
			<button
				type="button"
				class="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-slate-200 px-2 text-sm font-medium text-slate-700 transition disabled:pointer-events-none disabled:opacity-50 hover:bg-slate-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
				aria-label="Página siguiente"
				disabled={!canNext}
				onclick={() => onPageIndexChange(Math.min(pageCount - 1, pageIndex + 1))}
			>Siguiente ›</button>
			<button
				type="button"
				class="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-slate-200 px-2 text-sm font-medium text-slate-700 transition disabled:pointer-events-none disabled:opacity-50 hover:bg-slate-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
				aria-label="Última página"
				disabled={!canLast}
				onclick={() => onPageIndexChange(Math.max(0, pageCount - 1))}
			>Último »</button>
		</nav>
	</div>
{:else}
	<div class="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500 dark:text-slate-400">
		<span>Página 1 de 1</span>
		<div class="flex gap-1">
			<button type="button" class="rounded border px-2 py-1 disabled:opacity-50" disabled>« Primero</button>
			<button type="button" class="rounded border px-2 py-1 disabled:opacity-50" disabled>‹ Anterior</button>
			<button type="button" class="rounded border px-2 py-1 disabled:opacity-50" disabled>Siguiente ›</button>
			<button type="button" class="rounded border px-2 py-1 disabled:opacity-50" disabled>Último »</button>
		</div>
	</div>
{/if}
