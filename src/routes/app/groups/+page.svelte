<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { DataTable } from '$lib/components/table';
	import type { DataTableColumn } from '$lib/components/table';
	import { supabase } from '$lib/supabase/client';
	import { toastsStore } from '$lib/stores/toasts';
	import { onMount } from 'svelte';

	type Group = {
		id: string;
		name: string;
		sort_order: number;
		active: boolean;
		created_at: string;
		updated_at: string;
	};

	type GroupItem = {
		id: string;
		group_id: string;
		parent_id: string | null;
		name: string;
		sort_order: number;
		active: boolean;
		created_at: string;
		updated_at: string;
	};

	let groups = $state<Group[]>([]);
	let loading = $state(true);
	let dialogOpen = $state(false);
	let detailDrawerOpen = $state(false);
	let editingId = $state<string | null>(null);
	let form = $state({ name: '', sort_order: 0, active: true });
	let saving = $state(false);

	let groupItems = $state<GroupItem[]>([]);
	let groupItemsLoading = $state(false);
	let newItemName = $state('');
	let newItemParentId = $state<string | null>(null);
	let addingItem = $state(false);
	let expandedCategories = $state<Set<string>>(new Set());
	let editingItemId = $state<string | null>(null);
	let editingItemName = $state('');
	let savingItemEdit = $state(false);
	let groupToDelete = $state<Group | null>(null);

	const selectedGroup = $derived(editingId ? groups.find((g) => g.id === editingId) ?? null : null);

	const loadGroups = async () => {
		loading = true;
		const timeoutId = setTimeout(() => {
			loading = false;
			toastsStore.error('La carga de grupos tardó demasiado. Revisá la conexión.');
		}, 12_000);
		try {
			const { data, error } = await supabase
				.from('product_groups')
				.select('id, name, sort_order, active, created_at, updated_at')
				.order('sort_order', { ascending: true })
				.order('name', { ascending: true });

			if (error) {
				toastsStore.error(error.message || 'Error al cargar grupos. Si sigue fallando, probá cerrar sesión y volver a entrar.');
				groups = [];
			} else {
				groups = data ?? [];
			}
		} catch (e) {
			toastsStore.error(e instanceof Error ? e.message : 'Error al cargar grupos. Revisá la conexión o volvé a iniciar sesión.');
			groups = [];
		} finally {
			clearTimeout(timeoutId);
			loading = false;
		}
	};

	const loadGroupItems = async (groupId: string) => {
		groupItemsLoading = true;
		const { data, error } = await supabase
			.from('product_group_items')
			.select('id, group_id, parent_id, name, sort_order, active, created_at, updated_at')
			.eq('group_id', groupId)
			.order('sort_order', { ascending: true })
			.order('name', { ascending: true });

		if (error) {
			toastsStore.error(error.message || 'Error al cargar ítems');
			groupItems = [];
		} else {
			groupItems = data ?? [];
			const catIds = (data ?? []).filter((i: GroupItem) => i.parent_id == null).map((i: GroupItem) => i.id);
			expandedCategories = new Set(catIds);
		}
		groupItemsLoading = false;
	};

	const categories = $derived(
		groupItems.filter((i) => i.parent_id == null).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
	);
	const getChildren = (parentId: string) =>
		groupItems
			.filter((i) => i.parent_id === parentId)
			.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
	const toggleCategory = (id: string) => {
		expandedCategories = new Set(expandedCategories);
		if (expandedCategories.has(id)) expandedCategories.delete(id);
		else expandedCategories.add(id);
	};

	const openCreate = () => {
		editingId = null;
		form = { name: '', sort_order: groups.length, active: true };
		dialogOpen = true;
	};

	const openEdit = (g: Group) => {
		editingId = g.id;
		form = { name: g.name, sort_order: g.sort_order, active: g.active };
		editingItemId = null;
		editingItemName = '';
		detailDrawerOpen = true;
		void loadGroupItems(g.id);
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
				.from('product_groups')
				.update({ name, sort_order: form.sort_order, active: form.active, updated_at: new Date().toISOString() })
				.eq('id', editingId);
			if (error) {
				toastsStore.error(error.message || 'Error al actualizar');
			} else {
				toastsStore.success('Grupo actualizado');
				dialogOpen = false;
				detailDrawerOpen = false;
				await loadGroups();
			}
		} else {
			const { error } = await supabase.from('product_groups').insert({
				name,
				sort_order: form.sort_order,
				active: form.active
			});
			if (error) {
				toastsStore.error(error.message || 'Error al crear');
			} else {
				toastsStore.success('Grupo creado');
				dialogOpen = false;
				await loadGroups();
			}
		}
		saving = false;
	};

	const saveGroupFromDrawer = async () => {
		const name = form.name.trim();
		if (!name || !editingId) return;
		saving = true;
		const { error } = await supabase
			.from('product_groups')
			.update({ name, sort_order: form.sort_order, active: form.active, updated_at: new Date().toISOString() })
			.eq('id', editingId);
		saving = false;
		if (error) {
			toastsStore.error(error.message || 'Error al actualizar');
		} else {
			toastsStore.success('Grupo actualizado');
			await loadGroups();
		}
	};

	const addItem = async (parentId: string | null) => {
		const name = newItemName.trim();
		if (!name || !editingId) {
			toastsStore.error('Escribí el nombre');
			return;
		}
		addingItem = true;
		const countInLevel = parentId
			? groupItems.filter((i) => i.parent_id === parentId).length
			: groupItems.filter((i) => i.parent_id == null).length;
		const { error } = await supabase.from('product_group_items').insert({
			group_id: editingId,
			parent_id: parentId,
			name,
			sort_order: countInLevel,
			active: true
		});
		addingItem = false;
		if (error) {
			toastsStore.error(error.message || 'Error al agregar');
		} else {
			toastsStore.success(parentId ? 'Ítem agregado' : 'Categoría agregada');
			newItemName = '';
			if (parentId) expandedCategories.add(parentId);
			expandedCategories = new Set(expandedCategories);
			void loadGroupItems(editingId);
		}
	};

	const startEditItem = (item: GroupItem) => {
		editingItemId = item.id;
		editingItemName = item.name;
	};
	const cancelEditItem = () => {
		editingItemId = null;
		editingItemName = '';
	};
	const saveItemEdit = async () => {
		const name = editingItemName.trim();
		if (!name || !editingItemId) return;
		savingItemEdit = true;
		const { error } = await supabase
			.from('product_group_items')
			.update({ name, updated_at: new Date().toISOString() })
			.eq('id', editingItemId);
		savingItemEdit = false;
		editingItemId = null;
		editingItemName = '';
		if (error) {
			toastsStore.error(error.message || 'Error al guardar');
		} else {
			toastsStore.success('Guardado');
			if (editingId) void loadGroupItems(editingId);
		}
	};

	const removeItem = async (item: GroupItem) => {
		const isCategory = item.parent_id == null;
		const childCount = isCategory ? getChildren(item.id).length : 0;
		const msg =
			childCount > 0
				? `¿Eliminar la categoría "${item.name}" y sus ${childCount} ítems?`
				: isCategory
					? '¿Eliminar esta categoría?'
					: '¿Eliminar este ítem?';
		if (!confirm(msg)) return;
		const { error } = await supabase.from('product_group_items').delete().eq('id', item.id);
		if (error) {
			toastsStore.error(error.message || 'Error al eliminar');
		} else {
			toastsStore.success(isCategory ? 'Categoría eliminada' : 'Ítem eliminado');
			if (editingId) void loadGroupItems(editingId);
		}
	};

	const remove = async (id: string) => {
		const { error } = await supabase.from('product_groups').delete().eq('id', id);
		if (error) {
			toastsStore.error(error.message || 'Error al eliminar');
		} else {
			toastsStore.success('Grupo eliminado');
			if (editingId === id) detailDrawerOpen = false;
			await loadGroups();
		}
		groupToDelete = null;
	};

	const openDeleteConfirm = (grp: Group) => {
		groupToDelete = grp;
	};

	onMount(() => {
		void loadGroups();
	});

	const activeCount = $derived(groups.filter((g) => g.active).length);

	const groupColumns: DataTableColumn<Group>[] = [
		{ id: 'name', header: 'Nombre', accessorKey: 'name' },
		{ id: 'sort_order', header: 'Orden', accessorKey: 'sort_order' },
		{ id: 'active', header: 'Estado', accessorFn: (r) => (r.active ? 'Activo' : 'Inactivo') }
	];
</script>

<div class="space-y-4">
	<div class="panel flex items-center justify-between p-4">
		<div>
			<h1 class="text-base font-semibold">Grupos</h1>
			<p class="text-xs text-slate-500 dark:text-slate-400">
				Grupos de opciones por producto (sabores, tamaños, extras) y sus ítems.
			</p>
		</div>
		<button class="btn-primary" onclick={openCreate}>+ Nuevo grupo</button>
	</div>

	<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
		<div class="panel p-4">
			<p class="text-sm text-slate-500 dark:text-slate-400">Total grupos</p>
			<p class="mt-1 text-4xl font-semibold">{groups.length}</p>
		</div>
		<div class="panel p-4">
			<p class="text-sm text-slate-500 dark:text-slate-400">Activos</p>
			<p class="mt-1 text-4xl font-semibold">{activeCount}</p>
		</div>
	</div>

	<section class="panel p-4">
		<DataTable
			tableId="groups"
			data={groups}
			columns={groupColumns}
			rowId={(g) => g.id}
			globalSearch={{ keys: ['name'], placeholder: 'Buscar por nombre' }}
			actions={[
				{ label: 'Editar y agregar ítems', onClick: openEdit, variant: 'secondary', icon: 'edit' }
			]}
			emptyMessage="Aún no hay grupos. Creá uno con «Nuevo grupo» (ej. Sabores)."
			loading={loading}
			persistState={true}
		/>
	</section>
</div>

<!-- Modal: nuevo grupo -->
<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-black/40" />
		<Dialog.Content class="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-4 dark:bg-black">
			<h3 class="mb-3 text-lg font-semibold">Nuevo grupo</h3>
			<div class="space-y-3">
				<label class="block space-y-1">
					<span class="text-sm font-medium">Nombre</span>
					<input class="input" bind:value={form.name} placeholder="ej. Sabores, Tamaños" />
				</label>
				<label class="block space-y-1">
					<span class="text-sm font-medium">Orden</span>
					<input class="input" type="number" min="0" bind:value={form.sort_order} />
				</label>
				<label class="flex items-center gap-2 text-sm">
					<input type="checkbox" bind:checked={form.active} />
					Activo
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

<!-- Modal: confirmar eliminar grupo -->
<Dialog.Root open={groupToDelete !== null} onOpenChange={(open) => { if (!open) groupToDelete = null; }}>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-black/40" />
		<Dialog.Content class="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-4 dark:bg-black">
			<h3 class="mb-2 text-lg font-semibold">Eliminar grupo</h3>
			<p class="mb-4 text-sm text-slate-600 dark:text-slate-400">
				¿Está seguro que desea eliminar el grupo "{groupToDelete?.name}" y todos sus ítems?
			</p>
			<div class="flex justify-end gap-2">
				<Dialog.Close class="btn-secondary">Cancelar</Dialog.Close>
				<button
					class="btn-danger"
					onclick={() => groupToDelete && remove(groupToDelete.id)}
				>
					Eliminar
				</button>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<!-- Drawer: editar grupo y ítems (sabores, etc.) -->
<Dialog.Root bind:open={detailDrawerOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-black/30" />
		<Dialog.Content
			class="fixed right-0 top-0 z-50 flex h-screen w-[480px] max-w-[95vw] flex-col border-l border-slate-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-black"
		>
			<div class="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-neutral-800">
				<h2 class="text-lg font-semibold">{selectedGroup?.name ?? 'Grupo'}</h2>
				<Dialog.Close
					class="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-neutral-900 dark:hover:text-neutral-200"
					aria-label="Cerrar"
				>
					<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
				</Dialog.Close>
			</div>

			<div class="min-h-0 flex-1 overflow-y-auto p-4">
				{#if selectedGroup}
					<div class="space-y-3">
						<label class="block space-y-1">
							<span class="text-sm font-medium">Nombre del grupo</span>
							<input class="input" bind:value={form.name} />
						</label>
						<label class="block space-y-1">
							<span class="text-sm font-medium">Orden</span>
							<input class="input" type="number" min="0" bind:value={form.sort_order} />
						</label>
						<label class="flex items-center gap-2 text-sm">
							<input type="checkbox" bind:checked={form.active} />
							Activo
						</label>
						<div class="flex gap-2">
							<button class="btn-primary !px-2 !py-1 text-sm" onclick={() => void saveGroupFromDrawer()} disabled={saving}>
								{saving ? 'Guardando…' : 'Guardar grupo'}
							</button>
						</div>
					</div>

					<div class="mt-6 border-t border-slate-200 pt-4 dark:border-neutral-800">
						<h3 class="mb-2 text-base font-semibold">Árbol de categorías e ítems</h3>
						<p class="mb-3 text-xs text-slate-500 dark:text-slate-400">
							Primero agregá categorías (ej. FRUTAS A LA CREMA, CHOCOLATES). Luego agregá ítems bajo cada categoría (ej. ANANA A LA CREMA, CHOCO. BLANCO).
						</p>

						<div class="mb-4 space-y-2">
							<input
								class="input w-full"
								placeholder="Nombre (categoría o ítem)"
								bind:value={newItemName}
								onkeydown={(e) => e.key === 'Enter' && (newItemParentId == null ? addItem(null) : addItem(newItemParentId))}
							/>
							<div class="flex flex-wrap items-center gap-2">
								<button
									class="btn-primary !px-2 !py-1 text-sm"
									onclick={() => void addItem(null)}
									disabled={addingItem || !newItemName.trim()}
								>
									{addingItem ? '…' : 'Agregar como categoría'}
								</button>
								{#if categories.length > 0}
									<span class="text-slate-500 dark:text-slate-400">o bajo:</span>
									<select
										class="input w-auto min-w-[140px]"
										bind:value={newItemParentId}
										onchange={(e) => (newItemParentId = (e.currentTarget.value || null) as string | null)}
									>
										<option value="">— elegir categoría —</option>
										{#each categories as cat}
											<option value={cat.id}>{cat.name}</option>
										{/each}
									</select>
									<button
										class="btn-secondary !px-2 !py-1 text-sm"
										onclick={() => newItemParentId != null && addItem(newItemParentId)}
										disabled={addingItem || !newItemName.trim() || newItemParentId == null}
									>
										Agregar ítem
									</button>
								{/if}
							</div>
						</div>

						{#if groupItemsLoading}
							<p class="py-4 text-center text-sm text-slate-500">Cargando…</p>
						{:else if categories.length === 0}
							<p class="rounded-lg border border-dashed border-slate-300 py-4 text-center text-sm text-slate-500 dark:border-slate-600">
								Aún no hay categorías. Agregá una arriba con "Agregar como categoría".
							</p>
						{:else}
							<ul class="space-y-1">
								{#each categories as cat}
									<li class="rounded-lg border border-slate-200 dark:border-neutral-800">
										<div class="flex items-center gap-1 px-2 py-1.5">
											<button
												class="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-neutral-900"
												onclick={() => toggleCategory(cat.id)}
												aria-label={expandedCategories.has(cat.id) ? 'Contraer' : 'Expandir'}
											>
												{#if expandedCategories.has(cat.id)}
													<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 15l-6-6-6 6"/></svg>
												{:else}
													<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
												{/if}
											</button>
											{#if editingItemId === cat.id}
												<input
													class="input flex-1 !py-1 text-sm"
													bind:value={editingItemName}
													onkeydown={(e) => e.key === 'Enter' && saveItemEdit()}
												/>
												<button class="btn-primary !px-2 !py-0.5 text-xs" onclick={() => void saveItemEdit()} disabled={savingItemEdit}>Guardar</button>
												<button class="btn-secondary !px-2 !py-0.5 text-xs" onclick={cancelEditItem}>Cancelar</button>
											{:else}
												<span class="flex-1 font-semibold text-slate-800 dark:text-slate-200">{cat.name}</span>
												<button class="btn-secondary !px-2 !py-0.5 text-xs" onclick={() => startEditItem(cat)}>Editar</button>
												<button class="btn-danger !px-2 !py-0.5 text-xs" onclick={() => void removeItem(cat)}>Eliminar</button>
											{/if}
										</div>
										{#if expandedCategories.has(cat.id)}
											<ul class="border-t border-slate-100 bg-slate-50/50 pl-6 pr-2 py-1 dark:border-neutral-800 dark:bg-neutral-900/50">
												{#each getChildren(cat.id) as child}
													<li class="flex items-center justify-between gap-1 py-1.5 text-sm">
														{#if editingItemId === child.id}
															<input
																class="input flex-1 !py-1 text-sm"
																bind:value={editingItemName}
																onkeydown={(e) => e.key === 'Enter' && saveItemEdit()}
															/>
															<button class="btn-primary !px-2 !py-0.5 text-xs shrink-0" onclick={() => void saveItemEdit()} disabled={savingItemEdit}>Guardar</button>
															<button class="btn-secondary !px-2 !py-0.5 text-xs shrink-0" onclick={cancelEditItem}>Cancelar</button>
														{:else}
															<span class="flex-1 text-slate-700 dark:text-slate-300">{child.name}</span>
															<button class="btn-secondary !px-2 !py-0.5 text-xs shrink-0" onclick={() => startEditItem(child)}>Editar</button>
															<button class="btn-danger !px-2 !py-0.5 text-xs shrink-0" onclick={() => void removeItem(child)}>Eliminar</button>
														{/if}
													</li>
												{/each}
												{#if getChildren(cat.id).length === 0}
													<li class="py-1 text-xs text-slate-500 dark:text-slate-400">Sin ítems. Agregá uno con "Agregar ítem" eligiendo esta categoría.</li>
												{/if}
											</ul>
										{/if}
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				{/if}
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
