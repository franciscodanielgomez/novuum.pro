<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { api } from '$lib/api';
	import { DataTable } from '$lib/components/table';
	import type { DataTableColumn } from '$lib/components/table';
	import { asyncGuard } from '$lib/data/asyncGuard';
	import { toastsStore } from '$lib/stores/toasts';
	import { posDataCache } from '$lib/pos/cache';
	import { posDataLog, posDataWarn } from '$lib/pos/diagnostics';
	import { clearPosSelfHealMark, tryPosSelfHealReload } from '$lib/pos/self-heal';
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
		image_url: string | null;
		created_at: string;
		updated_at: string;
	};

	type LoadStatus = 'idle' | 'loading' | 'refreshing' | 'error';
	const CACHE_KEY = 'groups';
	const RETRY_INTERVAL_MS = 15_000;
	const GROUPS_STUCK_RELOAD_MS = 20_000;
	const GROUPS_SELFHEAL_SCREEN_KEY = 'groups';

	let groups = $state<Group[]>([]);
	let status = $state<LoadStatus>('idle');
	let loadStartedAt = $state(0);
	let loadError = $state<string | null>(null);
	let dialogOpen = $state(false);
	let detailDrawerOpen = $state(false);
	let editingId = $state<string | null>(null);
	let form = $state({ name: '', sort_order: 0, active: true });
	let saving = $state(false);

	let groupItems = $state<GroupItem[]>([]);
	let groupItemsLoading = $state(false);
	let groupItemsLoadError = $state(false);
	let newItemName = $state('');
	let newItemParentId = $state<string | null>(null);
	let addingItem = $state(false);
	let expandedCategories = $state<Set<string>>(new Set());
	let editingItemId = $state<string | null>(null);
	let editingItemName = $state('');
	let editingItemImageUrl = $state('');
	let savingItemEdit = $state(false);
	let groupToDelete = $state<Group | null>(null);
	let itemSearchQuery = $state('');
	let groupItemsLoadController: AbortController | null = null;

	const selectedGroup = $derived.by(() =>
		editingId ? groups.find((g: Group) => g.id === editingId) ?? null : null
	);

	const fetchGroupsFromSupabase = async (): Promise<Group[]> => {
		const data = await api.groups.list();
		return (data ?? []) as Group[];
	};

	const fetchGroupItemsFromSupabase = async (groupId: string, signal?: AbortSignal) => {
		const data = await api.groups.listItems(groupId, signal);
		return (data ?? []) as GroupItem[];
	};

	async function revalidate() {
		const cached = groups.length > 0;
		status = cached ? 'refreshing' : 'loading';
		loadStartedAt = Date.now();
		loadError = null;
		posDataLog('groups revalidate start');
		try {
			const data = await fetchGroupsFromSupabase();
			groups = data;
			posDataCache.set(CACHE_KEY, data);
			status = 'idle';
			clearPosSelfHealMark(GROUPS_SELFHEAL_SCREEN_KEY);
			posDataLog('groups revalidate ok', { count: data.length });
		} catch (e) {
			const msg =
				e instanceof Error && e.name === 'AbortError'
					? 'La carga de grupos superó el tiempo de espera'
					: e instanceof Error
						? e.message
						: 'Error al cargar grupos';
			posDataWarn('groups revalidate fail', msg);
			loadError = msg;
			status = 'error';
		} finally {
			if (status === 'loading' || status === 'refreshing') status = 'idle';
		}
	}

	const loadGroups = () => void revalidate();

	const loadGroupItems = async (groupId: string) => {
		if (groupItemsLoadController) groupItemsLoadController.abort();
		const controller = new AbortController();
		groupItemsLoadController = controller;
		groupItemsLoading = true;
		groupItemsLoadError = false;
		try {
			const data = await fetchGroupItemsFromSupabase(groupId, controller.signal);
			groupItems = data;
			const catIds = data
				.filter((i: GroupItem) => i.parent_id == null)
				.map((i: GroupItem) => i.id);
			expandedCategories = new Set(catIds);
		} catch (e) {
			if (e instanceof Error && e.name === 'AbortError') return;
			groupItemsLoadError = true;
			groupItems = [];
			const message =
				e instanceof Error && e.name === 'AbortError'
					? 'La carga de ítems del grupo superó el tiempo de espera'
					: e instanceof Error && e.message
						? e.message
					: 'No se pudieron cargar los ítems del grupo';
			toastsStore.error(message);
		} finally {
			groupItemsLoading = false;
			if (groupItemsLoadController === controller) groupItemsLoadController = null;
		}
	};

	const categories = $derived(
		groupItems.filter((i) => i.parent_id == null).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
	);
	const getChildren = (parentId: string) =>
		groupItems
			.filter((i) => i.parent_id === parentId)
			.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));

	const itemSearchLower = $derived(itemSearchQuery.trim().toLowerCase());
	const filteredCategories = $derived(
		itemSearchLower
			? categories.filter(
					(cat) =>
						cat.name.toLowerCase().includes(itemSearchLower) ||
						getChildren(cat.id).some((c) => c.name.toLowerCase().includes(itemSearchLower))
				)
			: categories
	);
	const getChildrenFiltered = (parentId: string) => {
		const children = getChildren(parentId);
		return itemSearchLower ? children.filter((c) => c.name.toLowerCase().includes(itemSearchLower)) : children;
	};
	const expandedForSearch = $derived(
		itemSearchLower ? new Set(filteredCategories.map((c) => c.id)) : expandedCategories
	);
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

	const drawerRef = { open: false, editingId: null as string | null };
	$effect(() => {
		drawerRef.open = detailDrawerOpen;
		drawerRef.editingId = editingId;
	});

	$effect(() => {
		if (detailDrawerOpen) return;
		if (groupItemsLoadController) {
			groupItemsLoadController.abort();
			groupItemsLoadController = null;
		}
		groupItemsLoading = false;
	});

	const save = async () => {
		const name = form.name.trim();
		if (!name) {
			toastsStore.error('El nombre es obligatorio');
			return;
		}
		await asyncGuard(
			async () => {
				if (editingId) {
					await api.groups.updateGroup(editingId, {
						name,
						sort_order: form.sort_order,
						active: form.active,
						updated_at: new Date().toISOString()
					});
					toastsStore.success('Grupo actualizado');
					dialogOpen = false;
					detailDrawerOpen = false;
					await loadGroups();
					return;
				}
				await api.groups.createGroup({
					name,
					sort_order: form.sort_order,
					active: form.active
				});
				toastsStore.success('Grupo creado');
				dialogOpen = false;
				await loadGroups();
			},
			{
				setLoading: (value) => (saving = value),
				onError: (e) => {
					toastsStore.error(
						e instanceof Error && e.name === 'AbortError'
							? 'Guardado agotó el tiempo de espera'
							: 'No se pudo guardar el grupo'
					);
				}
			}
		);
	};

	const saveGroupFromDrawer = async () => {
		const name = form.name.trim();
		const groupId = editingId;
		if (!name || !groupId) return;
		await asyncGuard(
			async () => {
				await api.groups.updateGroup(groupId, {
					name,
					sort_order: form.sort_order,
					active: form.active,
					updated_at: new Date().toISOString()
				});
				toastsStore.success('Grupo actualizado');
				await loadGroups();
			},
			{
				setLoading: (value) => (saving = value),
				onError: (e) => {
					toastsStore.error(
						e instanceof Error && e.name === 'AbortError'
							? 'Guardado agotó el tiempo de espera'
							: 'No se pudo guardar el grupo'
					);
				}
			}
		);
	};

	const addItem = async (parentId: string | null) => {
		const name = newItemName.trim();
		const groupId = editingId;
		if (!name || !groupId) {
			toastsStore.error('Escribí el nombre');
			return;
		}
		const countInLevel = parentId
			? groupItems.filter((i) => i.parent_id === parentId).length
			: groupItems.filter((i) => i.parent_id == null).length;
		await asyncGuard(
			async () => {
				await api.groups.createItem({
					group_id: groupId,
					parent_id: parentId,
					name,
					sort_order: countInLevel,
					active: true
				});
				toastsStore.success(parentId ? 'Ítem agregado' : 'Categoría agregada');
				newItemName = '';
				if (parentId) expandedCategories.add(parentId);
				expandedCategories = new Set(expandedCategories);
				void loadGroupItems(groupId);
			},
			{
				setLoading: (value) => (addingItem = value),
				onError: (e) => {
					toastsStore.error(
						e instanceof Error && e.name === 'AbortError'
							? 'Alta agotó el tiempo de espera'
							: 'No se pudo agregar el ítem'
					);
				}
			}
		);
	};

	const startEditItem = (item: GroupItem) => {
		editingItemId = item.id;
		editingItemName = item.name;
		editingItemImageUrl = item.image_url ?? '';
	};
	const cancelEditItem = () => {
		editingItemId = null;
		editingItemName = '';
		editingItemImageUrl = '';
	};
	const saveItemEdit = async () => {
		const name = editingItemName.trim();
		const itemId = editingItemId;
		if (!name || !itemId) return;
		const imageUrl = editingItemImageUrl.trim() || null;
		await asyncGuard(
			async () => {
				await api.groups.updateItem(itemId, {
					name,
					image_url: imageUrl,
					updated_at: new Date().toISOString()
				});
				editingItemId = null;
				editingItemName = '';
				editingItemImageUrl = '';
				toastsStore.success('Guardado');
				if (editingId) void loadGroupItems(editingId);
			},
			{
				setLoading: (value) => (savingItemEdit = value),
				onError: (e) => {
					toastsStore.error(
						e instanceof Error && e.name === 'AbortError'
							? 'Guardado agotó el tiempo de espera'
							: 'No se pudo guardar el ítem'
					);
				}
			}
		);
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
		await asyncGuard(
			async () => {
				await api.groups.removeItem(item.id);
				toastsStore.success(isCategory ? 'Categoría eliminada' : 'Ítem eliminado');
				if (editingId) void loadGroupItems(editingId);
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

	const remove = async (id: string) => {
		await asyncGuard(
			async () => {
				await api.groups.removeGroup(id);
				toastsStore.success('Grupo eliminado');
				if (editingId === id) detailDrawerOpen = false;
				await loadGroups();
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
		groupToDelete = null;
	};

	const openDeleteConfirm = (grp: Group) => {
		groupToDelete = grp;
	};

	onMount(() => {
		if (typeof document !== 'undefined' && import.meta.env.DEV) console.debug('[route:groups] mount start');
		const cached = posDataCache.get<Group[]>(CACHE_KEY);
		if (cached?.length) {
			groups = cached;
			status = 'refreshing';
		} else {
			status = 'loading';
		}
		void revalidate();
		const retryIntervalId = setInterval(() => {
			if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
			if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
			if (status === 'error') void revalidate();
		}, RETRY_INTERVAL_MS);
		const stuckIntervalId = setInterval(() => {
			const stuck = (status === 'loading' || status === 'refreshing') && groups.length === 0 && Date.now() - loadStartedAt > GROUPS_STUCK_RELOAD_MS;
			if (!stuck) return;
			tryPosSelfHealReload(GROUPS_SELFHEAL_SCREEN_KEY);
		}, 2_000);
		// Carga al montar; sin refreshTrigger global (always-on POS).
		return () => {
			if (typeof document !== 'undefined' && import.meta.env.DEV) console.debug('[route:groups] cleanup');
			clearInterval(retryIntervalId);
			clearInterval(stuckIntervalId);
		};
	});

	const loading = $derived((status === 'loading' || status === 'refreshing') && groups.length === 0);
	const groupColumns: DataTableColumn<Group>[] = [
		{ id: 'name', header: 'Nombre', accessorKey: 'name' },
		{ id: 'sort_order', header: 'Orden', accessorKey: 'sort_order' },
		{ id: 'active', header: 'Estado', accessorFn: (r) => (r.active ? 'Activo' : 'Inactivo') }
	];
</script>

<div class="space-y-4">
	<div class="panel p-4">
		<h1 class="text-base font-semibold">Grupos</h1>
		<p class="text-xs text-slate-500 dark:text-slate-400">
			Grupos de opciones por producto (sabores, tamaños, extras) y sus ítems.
		</p>
		{#if status === 'error' && loadError}
			<p class="mt-2 text-sm text-amber-600 dark:text-amber-400">
				Sin conexión o error. Mostrando datos guardados. Reintentando…
			</p>
		{/if}
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
		>
			{#snippet toolbarActions()}
				<button type="button" class="btn-primary" onclick={openCreate}>+ Nuevo grupo</button>
			{/snippet}
		</DataTable>
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
			class="fixed right-0 top-0 z-50 flex h-screen w-1/2 min-w-[420px] max-w-[95vw] flex-col border-l border-slate-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-black"
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

			<div class="min-h-0 flex-1 overflow-y-auto p-5">
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

						<div class="mb-3">
							<input
								type="search"
								class="input w-full"
								placeholder="Buscar ítems o categorías…"
								bind:value={itemSearchQuery}
								aria-label="Buscar ítems o categorías"
							/>
						</div>

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
						{:else if groupItemsLoadError}
							<div class="rounded-lg border border-amber-200 bg-amber-50 py-4 text-center dark:border-amber-800 dark:bg-amber-950/40">
								<p class="text-sm text-amber-800 dark:text-amber-200">No se pudieron cargar los ítems. Revisá la conexión.</p>
								<button
									type="button"
									class="btn-primary mt-2"
									onclick={() => editingId && loadGroupItems(editingId)}
								>
									Reintentar
								</button>
							</div>
						{:else if categories.length === 0}
							<p class="rounded-lg border border-dashed border-slate-300 py-4 text-center text-sm text-slate-500 dark:border-slate-600">
								Aún no hay categorías. Agregá una arriba con "Agregar como categoría".
							</p>
						{:else if itemSearchLower && filteredCategories.length === 0}
							<p class="rounded-lg border border-dashed border-slate-300 py-4 text-center text-sm text-slate-500 dark:border-slate-600">
								Ningún ítem o categoría coincide con la búsqueda.
							</p>
						{:else}
							<ul class="space-y-1">
								{#each filteredCategories as cat}
									<li class="rounded-lg border border-slate-200 dark:border-neutral-800">
										<div class="flex items-center gap-1 px-2 py-1.5">
											<button
												class="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-neutral-900"
												onclick={() => toggleCategory(cat.id)}
												aria-label={expandedForSearch.has(cat.id) ? 'Contraer' : 'Expandir'}
											>
												{#if expandedForSearch.has(cat.id)}
													<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 15l-6-6-6 6"/></svg>
												{:else}
													<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
												{/if}
											</button>
											{#if editingItemId !== cat.id}
												<div class="h-8 w-8 shrink-0 overflow-hidden rounded bg-slate-200 dark:bg-neutral-700">
													{#if cat.image_url}
														<img src={cat.image_url} alt="" class="h-full w-full object-cover" />
													{:else}
														<span class="flex h-full w-full items-center justify-center text-slate-400 text-xs">—</span>
													{/if}
												</div>
											{/if}
											{#if editingItemId === cat.id}
												<div class="h-20 w-20 shrink-0 overflow-hidden rounded bg-slate-200 dark:bg-neutral-700">
													{#if editingItemImageUrl.trim()}
														<img src={editingItemImageUrl} alt="" class="h-full w-full object-cover" />
													{:else}
														<span class="flex h-full w-full items-center justify-center text-slate-400 text-xs">—</span>
													{/if}
												</div>
												<div class="flex min-w-0 flex-1 flex-col gap-2">
													<input
														class="input w-full !py-1.5 text-sm"
														placeholder="Nombre"
														bind:value={editingItemName}
														onkeydown={(e) => e.key === 'Enter' && saveItemEdit()}
													/>
													<input
														class="input w-full !py-1.5 text-sm"
														placeholder="URL de imagen"
														bind:value={editingItemImageUrl}
														onkeydown={(e) => e.key === 'Enter' && saveItemEdit()}
													/>
												</div>
												<div class="flex shrink-0 flex-col gap-1">
													<button class="btn-primary !px-2 !py-0.5 text-xs" onclick={() => void saveItemEdit()} disabled={savingItemEdit}>Guardar</button>
													<button class="btn-secondary !px-2 !py-0.5 text-xs" onclick={cancelEditItem}>Cancelar</button>
												</div>
											{:else}
												<span class="flex-1 font-semibold text-slate-800 dark:text-slate-200">{cat.name}</span>
												<button class="btn-secondary !px-2 !py-0.5 text-xs" onclick={() => startEditItem(cat)}>Editar</button>
												<button class="btn-danger !px-2 !py-0.5 text-xs" onclick={() => void removeItem(cat)}>Eliminar</button>
											{/if}
										</div>
										{#if expandedForSearch.has(cat.id)}
											<ul class="border-t border-slate-100 bg-slate-50/50 pl-6 pr-2 py-1 dark:border-neutral-800 dark:bg-neutral-900/50">
												{#each getChildrenFiltered(cat.id) as child}
													<li class="flex items-center justify-between gap-1 py-1.5 text-sm">
														{#if editingItemId !== child.id}
															<div class="h-8 w-8 shrink-0 overflow-hidden rounded bg-slate-200 dark:bg-neutral-700">
																{#if child.image_url}
																	<img src={child.image_url} alt="" class="h-full w-full object-cover" />
																{:else}
																	<span class="flex h-full w-full items-center justify-center text-slate-400 text-xs">—</span>
																{/if}
															</div>
														{/if}
														{#if editingItemId === child.id}
															<div class="h-20 w-20 shrink-0 overflow-hidden rounded bg-slate-200 dark:bg-neutral-700">
																{#if editingItemImageUrl.trim()}
																	<img src={editingItemImageUrl} alt="" class="h-full w-full object-cover" />
																{:else}
																	<span class="flex h-full w-full items-center justify-center text-slate-400 text-xs">—</span>
																{/if}
															</div>
															<div class="flex min-w-0 flex-1 flex-col gap-2">
																<input
																	class="input w-full !py-1.5 text-sm"
																	placeholder="Nombre"
																	bind:value={editingItemName}
																	onkeydown={(e) => e.key === 'Enter' && saveItemEdit()}
																/>
																<input
																	class="input w-full !py-1.5 text-sm"
																	placeholder="URL de imagen"
																	bind:value={editingItemImageUrl}
																	onkeydown={(e) => e.key === 'Enter' && saveItemEdit()}
																/>
															</div>
															<div class="flex shrink-0 flex-col gap-1">
																<button class="btn-primary !px-2 !py-0.5 text-xs" onclick={() => void saveItemEdit()} disabled={savingItemEdit}>Guardar</button>
																<button class="btn-secondary !px-2 !py-0.5 text-xs" onclick={cancelEditItem}>Cancelar</button>
															</div>
														{:else}
															<span class="flex-1 text-slate-700 dark:text-slate-300">{child.name}</span>
															<button class="btn-secondary !px-2 !py-0.5 text-xs shrink-0" onclick={() => startEditItem(child)}>Editar</button>
															<button class="btn-danger !px-2 !py-0.5 text-xs shrink-0" onclick={() => void removeItem(child)}>Eliminar</button>
														{/if}
													</li>
												{/each}
												{#if getChildrenFiltered(cat.id).length === 0}
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
