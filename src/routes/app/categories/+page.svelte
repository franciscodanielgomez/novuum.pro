<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { DataTable } from '$lib/components/table';
	import type { DataTableColumn } from '$lib/components/table';
	import { api } from '$lib/api';
	import { asyncGuard } from '$lib/data/asyncGuard';
	import { refreshTrigger } from '$lib/stores/refreshTrigger';
	import { toastsStore } from '$lib/stores/toasts';
	import { posDataCache } from '$lib/pos/cache';
	import { posDataLog, posDataWarn } from '$lib/pos/diagnostics';
	import { clearPosSelfHealMark, tryPosSelfHealReload } from '$lib/pos/self-heal';
	import { onMount } from 'svelte';

	type Category = {
		id: string;
		name: string;
		sort_order: number;
		active: boolean;
		created_at: string;
		updated_at: string;
	};

	type LoadStatus = 'idle' | 'loading' | 'refreshing' | 'error';

	const CACHE_KEY = 'categories';
	const CATEGORIES_STUCK_RELOAD_MS = 20_000;
	const CATEGORIES_SELFHEAL_SCREEN_KEY = 'categories';
	let categories = $state<Category[]>([]);
	let status = $state<LoadStatus>('idle');
	let loadStartedAt = $state(0);
	let loadError = $state<string | null>(null);
	let dialogOpen = $state(false);
	let editingId = $state<string | null>(null);
	let form = $state({ name: '', sort_order: 0, active: true });
	let saving = $state(false);

	const columns: DataTableColumn<Category>[] = [
		{ id: 'name', header: 'Nombre', accessorKey: 'name' },
		{ id: 'sort_order', header: 'Orden', accessorKey: 'sort_order' },
		{ id: 'active', header: 'Estado', accessorFn: (r) => (r.active ? 'Activa' : 'Inactiva') }
	];

	const fetchCategories = async (): Promise<Category[]> => {
		const data = await api.categories.list();
		return (data ?? []) as Category[];
	};

	/** Revalidar en background; no borra datos en error. */
	async function revalidate() {
		const cached = categories.length > 0;
		status = cached ? 'refreshing' : 'loading';
		loadStartedAt = Date.now();
		loadError = null;
		posDataLog('categories revalidate start');
		try {
			const data = await fetchCategories();
			categories = data;
			posDataCache.set(CACHE_KEY, data);
			status = 'idle';
			clearPosSelfHealMark(CATEGORIES_SELFHEAL_SCREEN_KEY);
			posDataLog('categories revalidate ok', { count: data.length });
		} catch (e) {
			const msg =
				e instanceof Error && e.name === 'AbortError'
					? 'La carga de categorías superó el tiempo de espera'
					: e instanceof Error
						? e.message
						: 'Error al cargar categorías';
			posDataWarn('categories revalidate fail', msg);
			loadError = msg;
			status = 'error';
			// Nunca limpiar categories; mantener cache visible
		} finally {
			if (status === 'loading' || status === 'refreshing') status = 'idle';
		}
	}

	const RETRY_INTERVAL_MS = 15_000;

	onMount(() => {
		const cached = posDataCache.get<Category[]>(CACHE_KEY);
		if (cached?.length) {
			categories = cached;
			status = 'refreshing';
		} else {
			status = 'loading';
		}
		void revalidate();

		const retryIntervalId = setInterval(() => {
			if (status === 'error') void revalidate();
		}, RETRY_INTERVAL_MS);
		const stuckIntervalId = setInterval(() => {
			const stuck = (status === 'loading' || status === 'refreshing') && categories.length === 0 && Date.now() - loadStartedAt > CATEGORIES_STUCK_RELOAD_MS;
			if (!stuck) return;
			tryPosSelfHealReload(CATEGORIES_SELFHEAL_SCREEN_KEY);
		}, 2_000);

		let firstRefresh = true;
		const unsub = refreshTrigger.subscribe(() => {
			if (firstRefresh) {
				firstRefresh = false;
				return;
			}
			void revalidate();
		});
		return () => {
			clearInterval(retryIntervalId);
			clearInterval(stuckIntervalId);
			unsub();
		};
	});

	const openCreate = () => {
		editingId = null;
		form = { name: '', sort_order: categories.length, active: true };
		dialogOpen = true;
	};

	const openEdit = (c: Category) => {
		editingId = c.id;
		form = { name: c.name, sort_order: c.sort_order, active: c.active };
		dialogOpen = true;
	};

	const save = async () => {
		const name = form.name.trim();
		if (!name) {
			toastsStore.error('El nombre es obligatorio');
			return;
		}
		await asyncGuard(
			async () => {
				if (editingId) {
					await api.categories.update(editingId, {
						name,
						sort_order: form.sort_order,
						active: form.active,
						updated_at: new Date().toISOString()
					});
					toastsStore.success('Categoría actualizada');
				} else {
					await api.categories.create({
						name,
						sort_order: form.sort_order,
						active: form.active
					});
					toastsStore.success('Categoría creada');
				}
				dialogOpen = false;
				void revalidate();
			},
			{
				setLoading: (value) => (saving = value),
				onError: (e) => {
					toastsStore.error(
						e instanceof Error && e.name === 'AbortError'
							? 'Guardado agotó el tiempo de espera'
							: 'No se pudo guardar'
					);
				}
			}
		);
	};

	const remove = async (id: string) => {
		if (!confirm('¿Eliminar esta categoría?')) return;
		await asyncGuard(
			async () => {
				await api.categories.remove(id);
				toastsStore.success('Categoría eliminada');
				void revalidate();
			},
			{
				onError: (e) => {
					toastsStore.error(
						e instanceof Error && e.name === 'AbortError'
							? 'Eliminación agotó el tiempo de espera'
							: 'No se pudo eliminar'
					);
				}
			}
		);
	};

	const loading = $derived((status === 'loading' || status === 'refreshing') && categories.length === 0);
</script>

<div class="space-y-4">
	<div class="panel p-4">
		<h1 class="text-base font-semibold">Categorías</h1>
		<p class="text-xs text-slate-500 dark:text-slate-400">
			Organizá los productos por tipo (bebidas, comidas, etc.) y orden de aparición.
		</p>
		{#if status === 'error' && loadError}
			<p class="mt-2 text-sm text-amber-600 dark:text-amber-400">
				Sin conexión o error. Mostrando datos guardados. Reintentando…
			</p>
		{/if}
	</div>

	<section class="panel p-4">
		<DataTable
			tableId="categories"
			data={categories}
			columns={columns}
			rowId={(c) => c.id}
			globalSearch={{ keys: ['name'], placeholder: 'Buscar por nombre' }}
			actions={[
				{ label: 'Editar', onClick: openEdit, variant: 'secondary', icon: 'edit' },
				{ label: 'Eliminar', onClick: (c) => void remove(c.id), variant: 'danger', icon: 'trash' }
			]}
			emptyMessage="Aún no hay categorías. Creá una con «Nueva categoría»."
			loading={loading}
			persistState={true}
		>
			{#snippet toolbarActions()}
				<button type="button" class="btn-primary" onclick={openCreate}>+ Nueva categoría</button>
			{/snippet}
		</DataTable>
	</section>
</div>

<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-black/40" />
		<Dialog.Content class="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-4 dark:bg-black">
			<h3 class="mb-3 text-lg font-semibold">{editingId ? 'Editar categoría' : 'Nueva categoría'}</h3>
			<div class="space-y-3">
				<label class="block space-y-1">
					<span class="text-sm font-medium">Nombre</span>
					<input class="input" bind:value={form.name} placeholder="ej. HELADERÍA, PIZZA" />
				</label>
				<label class="block space-y-1">
					<span class="text-sm font-medium">Orden</span>
					<input class="input" type="number" min="0" bind:value={form.sort_order} />
				</label>
				<label class="flex items-center gap-2 text-sm">
					<input type="checkbox" bind:checked={form.active} />
					Activa
				</label>
				<div class="flex justify-end gap-2">
					<Dialog.Close class="btn-secondary">Cancelar</Dialog.Close>
					<button class="btn-primary" onclick={save} disabled={saving}>
						{saving ? 'Guardando…' : 'Guardar'}
					</button>
				</div>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
