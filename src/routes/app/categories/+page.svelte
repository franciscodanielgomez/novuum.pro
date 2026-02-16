<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { supabase } from '$lib/supabase/client';
	import { toastsStore } from '$lib/stores/toasts';
	import { onMount } from 'svelte';

	type Category = {
		id: string;
		name: string;
		sort_order: number;
		active: boolean;
		created_at: string;
		updated_at: string;
	};

	let categories = $state<Category[]>([]);
	let loading = $state(true);
	let dialogOpen = $state(false);
	let editingId = $state<string | null>(null);
	let form = $state({ name: '', sort_order: 0, active: true });
	let saving = $state(false);

	const loadCategories = async () => {
		loading = true;
		const { data, error } = await supabase
			.from('categories')
			.select('id, name, sort_order, active, created_at, updated_at')
			.order('sort_order', { ascending: true })
			.order('name', { ascending: true });

		if (error) {
			toastsStore.error(error.message || 'Error al cargar categorías');
			categories = [];
		} else {
			categories = data ?? [];
		}
		loading = false;
	};

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
		saving = true;
		if (editingId) {
			const { error } = await supabase
				.from('categories')
				.update({ name, sort_order: form.sort_order, active: form.active, updated_at: new Date().toISOString() })
				.eq('id', editingId);
			if (error) {
				toastsStore.error(error.message || 'Error al actualizar');
			} else {
				toastsStore.success('Categoría actualizada');
				dialogOpen = false;
				await loadCategories();
			}
		} else {
			const { error } = await supabase.from('categories').insert({
				name,
				sort_order: form.sort_order,
				active: form.active
			});
			if (error) {
				toastsStore.error(error.message || 'Error al crear');
			} else {
				toastsStore.success('Categoría creada');
				dialogOpen = false;
				await loadCategories();
			}
		}
		saving = false;
	};

	const remove = async (id: string) => {
		if (!confirm('¿Eliminar esta categoría?')) return;
		const { error } = await supabase.from('categories').delete().eq('id', id);
		if (error) {
			toastsStore.error(error.message || 'Error al eliminar');
		} else {
			toastsStore.success('Categoría eliminada');
			await loadCategories();
		}
	};

	onMount(() => {
		void loadCategories();
	});

	const activeCount = $derived(categories.filter((c) => c.active).length);
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-lg font-semibold">Categorías</h1>
		<button class="btn-primary" onclick={openCreate}>+ Nueva categoría</button>
	</div>

	<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
		<div class="panel p-4">
			<p class="text-sm text-slate-500 dark:text-slate-400">Total categorías</p>
			<p class="mt-1 text-4xl font-semibold">{categories.length}</p>
		</div>
		<div class="panel p-4">
			<p class="text-sm text-slate-500 dark:text-slate-400">Activas</p>
			<p class="mt-1 text-4xl font-semibold">{activeCount}</p>
		</div>
	</div>

	<section class="panel p-4">
		{#if loading}
			<p class="py-8 text-center text-sm text-slate-500 dark:text-slate-400">Cargando…</p>
		{:else if categories.length === 0}
			<p class="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
				Aún no hay categorías. Creá una con "Nueva categoría".
			</p>
		{:else}
			<div class="overflow-auto">
				<table class="min-w-full text-sm">
					<thead class="bg-slate-50 dark:bg-slate-800">
						<tr>
							<th class="px-3 py-2 text-left">Nombre</th>
							<th class="px-3 py-2 text-left">Orden</th>
							<th class="px-3 py-2 text-left">Estado</th>
							<th class="px-3 py-2 text-left">Acciones</th>
						</tr>
					</thead>
					<tbody>
						{#each categories as cat}
							<tr
								class="border-t border-slate-100 transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/40"
							>
								<td class="px-3 py-2 font-medium">{cat.name}</td>
								<td class="px-3 py-2">{cat.sort_order}</td>
								<td class="px-3 py-2">
									<span
										class="rounded-full px-2 py-1 text-xs"
										class:bg-emerald-100={cat.active}
										class:text-emerald-700={cat.active}
										class:bg-slate-200={!cat.active}
										class:text-slate-600={!cat.active}
										class:dark:bg-emerald-900={cat.active}
										class:dark:text-emerald-200={cat.active}
										class:dark:bg-slate-700={!cat.active}
										class:dark:text-slate-400={!cat.active}
									>
										{cat.active ? 'Activa' : 'Inactiva'}
									</span>
								</td>
								<td class="px-3 py-2">
									<div class="flex gap-2">
										<button class="btn-secondary !px-2 !py-1 text-xs" onclick={() => openEdit(cat)}>
											Editar
										</button>
										<button class="btn-danger !px-2 !py-1 text-xs" onclick={() => remove(cat.id)}>
											Eliminar
										</button>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<div class="mt-4 text-sm text-slate-500 dark:text-slate-400">
				Mostrando 1–{categories.length} de {categories.length}
			</div>
		{/if}
	</section>
</div>

<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-black/40" />
		<Dialog.Content class="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-4 dark:bg-slate-900">
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
