<script lang="ts">
	import { Dialog } from 'bits-ui';
	import SideDrawer from '$lib/components/SideDrawer.svelte';
	import { DataTable } from '$lib/components/table';
	import type { DataTableColumn } from '$lib/components/table';
	import { api } from '$lib/api';
	import { customerSchema, customersBulkSchema } from '$lib/schemas';
	import { customersStore, customersStatus, customersLoadError } from '$lib/stores/customers';
	import { refreshTrigger } from '$lib/stores/refreshTrigger';
	import { toastsStore } from '$lib/stores/toasts';
	import type { Customer } from '$lib/types';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { clearPosSelfHealMark, tryPosSelfHealReload } from '$lib/pos/self-heal';

	let drawerOpen = $state(false);
	let importOpen = $state(false);
	let importJson = $state('');
	let importError = $state('');
	let importing = $state(false);
	let editing = $state<Customer | null>(null);
	let form = $state({ phone: '', address: '', betweenStreets: '', notes: '' });
	let saving = $state(false);

	// Modal "Buscar o agregar cliente" (como en el POS)
	let newClientModalOpen = $state(false);
	let addClientMode = $state(false);
	let newClientForm = $state({ phone: '', address: '', betweenStreets: '', notes: '' });
	let modalSaving = $state(false);
	let modalClientSearch = $state('');
	let modalLookupResults = $state<Customer[]>([]);
	let modalLookupLoading = $state(false);
	let modalLookupFor = $state('');
	let existingCustomerByPhoneLookup = $state<Customer | null>(null);
	let existingCustomerByPhoneLookupLoading = $state(false);
	let existingCustomerByPhoneLookupFor = $state('');

	let customersList = $state<Customer[]>([]);
	const CLIENTS_STUCK_RELOAD_MS = 20_000;
	const CLIENTS_SELFHEAL_SCREEN_KEY = 'clients';
	let loadStartedAt = $state(0);
	$effect(() => {
		const next = Array.isArray($customersStore) ? $customersStore : [];
		customersList = next;
		if (next.length > 0) clearPosSelfHealMark(CLIENTS_SELFHEAL_SCREEN_KEY);
	});
	const loading = $derived(
		($customersStatus === 'loading' || $customersStatus === 'refreshing') && customersList.length === 0
	);

	// Búsqueda por teléfono: misma API que el POS (api.customers.search).
	let clientSearchQuery = $state('');
	let clientSearchResults = $state<Customer[]>([]);
	let clientSearchLoading = $state(false);
	let clientSearchError = $state(false);

	const searchDigits = $derived(String(clientSearchQuery ?? '').replace(/\D/g, ''));

	// Filtro local por teléfono (dígitos).
	const filteredFromStore = $derived.by(() => {
		const list = Array.isArray($customersStore) ? $customersStore : [];
		const digits = searchDigits;
		if (digits.length < 4) return list;
		return list.filter((c) => {
			const phoneDigits = String(c.phone ?? '').replace(/\D/g, '');
			return phoneDigits.includes(digits) || phoneDigits === digits;
		});
	});

	// Debounce y llamada a API (solo en el cliente; misma API que el POS).
	let searchTimeoutId: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		if (!browser) return;
		const q = String(clientSearchQuery ?? '').trim();
		const digits = q.replace(/\D/g, '');
		if (digits.length < 4) {
			if (searchTimeoutId) clearTimeout(searchTimeoutId);
			searchTimeoutId = null;
			clientSearchResults = [];
			clientSearchLoading = false;
			clientSearchError = false;
			return;
		}
		if (searchTimeoutId) clearTimeout(searchTimeoutId);
		searchTimeoutId = setTimeout(() => {
			searchTimeoutId = null;
			clientSearchLoading = true;
			clientSearchResults = [];
			clientSearchError = false;
			const queryAtCall = q;
			api.customers
				.search(queryAtCall)
				.then((list) => {
					clientSearchResults = list ?? [];
				})
				.catch(() => {
					clientSearchResults = [];
					clientSearchError = true;
				})
				.finally(() => {
					clientSearchLoading = false;
				});
		}, 350);
		return () => {
			if (searchTimeoutId) clearTimeout(searchTimeoutId);
		};
	});

	const displayList = $derived(
		searchDigits.length < 4
			? customersList
			: filteredFromStore.length > 0
				? filteredFromStore
				: clientSearchResults
	);

	// Modal: lista filtrada en memoria y búsqueda por API
	const modalFilteredClients = $derived.by(() => {
		const list = Array.isArray($customersStore) ? $customersStore : [];
		const q = String(modalClientSearch ?? '').trim().toLowerCase();
		if (!q) return list;
		const qDigits = q.replace(/\D/g, '');
		return list.filter((c) => {
			const phone = String(c.phone ?? '');
			const phoneDigits = phone.replace(/\D/g, '');
			const addr = String(c.address ?? '').toLowerCase();
			const between = String(c.betweenStreets ?? '').toLowerCase();
			const notes = String(c.notes ?? '').toLowerCase();
			return (
				phone.toLowerCase().includes(q) ||
				(qDigits.length >= 4 && (phoneDigits.includes(qDigits) || phoneDigits === qDigits)) ||
				addr.includes(q) ||
				between.includes(q) ||
				notes.includes(q)
			);
		});
	});
	let modalLookupTimeoutId: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		if (!browser || !newClientModalOpen || addClientMode) return;
		const q = String(modalClientSearch ?? '').trim();
		const noResults = modalFilteredClients.length === 0;
		if (!noResults || q.length < 2) {
			if (modalLookupTimeoutId) clearTimeout(modalLookupTimeoutId);
			modalLookupTimeoutId = null;
			modalLookupResults = [];
			modalLookupLoading = false;
			modalLookupFor = '';
			return;
		}
		if (modalLookupFor === q) return;
		if (modalLookupTimeoutId) clearTimeout(modalLookupTimeoutId);
		modalLookupTimeoutId = setTimeout(() => {
			modalLookupTimeoutId = null;
			modalLookupFor = q;
			modalLookupResults = [];
			modalLookupLoading = true;
			api.customers
				.search(q)
				.then((list) => {
					if (modalLookupFor === q) modalLookupResults = list ?? [];
				})
				.catch(() => {
					if (modalLookupFor === q) modalLookupResults = [];
				})
				.finally(() => {
					if (modalLookupFor === q) modalLookupLoading = false;
				});
		}, 350);
		return () => {
			if (modalLookupTimeoutId) clearTimeout(modalLookupTimeoutId);
		};
	});
	const modalClientsToShow = $derived(
		modalFilteredClients.length > 0 ? modalFilteredClients : modalLookupResults
	);

	// En formulario "Agregar cliente nuevo": si el teléfono tiene 6+ dígitos, comprobar por API si ya existe
	let existingLookupTimeoutId: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		if (!browser || !newClientModalOpen || !addClientMode) {
			existingCustomerByPhoneLookup = null;
			existingCustomerByPhoneLookupLoading = false;
			existingCustomerByPhoneLookupFor = '';
			if (existingLookupTimeoutId) clearTimeout(existingLookupTimeoutId);
			existingLookupTimeoutId = null;
			return;
		}
		const digits = String(newClientForm.phone ?? '').replace(/\D/g, '');
		if (digits.length < 6) {
			existingCustomerByPhoneLookup = null;
			existingCustomerByPhoneLookupLoading = false;
			existingCustomerByPhoneLookupFor = '';
			return;
		}
		if (existingCustomerByPhoneLookupFor === digits) return;
		if (existingLookupTimeoutId) clearTimeout(existingLookupTimeoutId);
		existingLookupTimeoutId = setTimeout(() => {
			existingLookupTimeoutId = null;
			existingCustomerByPhoneLookupFor = digits;
			existingCustomerByPhoneLookup = null;
			existingCustomerByPhoneLookupLoading = true;
			api.customers
				.findByPhone(newClientForm.phone.trim() || digits)
				.then((customer) => {
					if (existingCustomerByPhoneLookupFor === digits) existingCustomerByPhoneLookup = customer;
				})
				.catch(() => {
					if (existingCustomerByPhoneLookupFor === digits) existingCustomerByPhoneLookup = null;
				})
				.finally(() => {
					if (existingCustomerByPhoneLookupFor === digits) existingCustomerByPhoneLookupLoading = false;
				});
		}, 400);
		return () => {
			if (existingLookupTimeoutId) clearTimeout(existingLookupTimeoutId);
		};
	});
	const existingCustomerWhenAdding = $derived(existingCustomerByPhoneLookup);

	const columns: DataTableColumn<Customer>[] = [
		{ id: 'phone', header: 'Teléfono', accessorKey: 'phone' },
		{ id: 'address', header: 'Dirección', accessorKey: 'address' },
		{ id: 'betweenStreets', header: 'Entre calles', accessorFn: (r) => r.betweenStreets ?? '—' },
		{ id: 'notes', header: 'Observación', accessorFn: (r) => r.notes ?? '—' }
	];

	const openNew = () => {
		newClientModalOpen = true;
		addClientMode = false;
		newClientForm = { phone: '', address: '', betweenStreets: '', notes: '' };
		modalClientSearch = '';
		modalLookupResults = [];
		modalLookupLoading = false;
		modalLookupFor = '';
		existingCustomerByPhoneLookup = null;
		existingCustomerByPhoneLookupLoading = false;
		existingCustomerByPhoneLookupFor = '';
		void customersStore.revalidate();
	};

	const useExistingClient = (customer: Customer) => {
		newClientModalOpen = false;
		addClientMode = false;
		openEdit(customer);
	};

	const createNewClientFromModal = async () => {
		if (existingCustomerWhenAdding) {
			toastsStore.error('Ya existe un cliente con este teléfono. Usá «Usar este cliente».');
			return;
		}
		const parsed = customerSchema.safeParse(newClientForm);
		if (!parsed.success) {
			toastsStore.error(parsed.error.issues[0]?.message ?? 'Datos inválidos');
			return;
		}
		modalSaving = true;
		try {
			await customersStore.create(parsed.data);
			toastsStore.success('Cliente creado');
			newClientModalOpen = false;
			addClientMode = false;
			void customersStore.revalidate();
		} catch (e) {
			const err = e as Error & { message?: string };
			toastsStore.error(err?.message?.trim() ? err.message : 'No se pudo crear el cliente');
		} finally {
			modalSaving = false;
		}
	};

	const openEdit = (customer: Customer) => {
		editing = customer;
		form = {
			phone: customer.phone,
			address: customer.address,
			betweenStreets: customer.betweenStreets ?? '',
			notes: customer.notes ?? ''
		};
		drawerOpen = true;
	};

	const createOrderWith = (customer: Customer) => {
		void goto(`/app/create_order?customerId=${encodeURIComponent(customer.id)}`);
	};

	const save = async () => {
		const parsed = customerSchema.safeParse(form);
		if (!parsed.success) {
			toastsStore.error(parsed.error.issues[0]?.message ?? 'Datos inválidos');
			return;
		}
		saving = true;
		try {
			if (editing) {
				await customersStore.update(editing.id, parsed.data);
				toastsStore.success('Cliente actualizado');
			} else {
				await customersStore.create(parsed.data);
				toastsStore.success('Cliente creado');
			}
			drawerOpen = false;
		} catch (e) {
			const err = e as Error & { name?: string; message?: string };
			const msg =
				err?.name === 'AbortError'
					? 'Guardado agotó el tiempo de espera'
					: err?.message?.trim()
						? err.message
						: 'No se pudo guardar el cliente';
			toastsStore.error(msg);
		} finally {
			saving = false;
		}
	};

	onMount(() => {
		loadStartedAt = Date.now();
		void customersStore.load().then(() => {
			const editId = $page.url.searchParams.get('editId');
			if (editId) {
				const customer = $customersStore.find((c) => c.id === editId);
				if (customer) openEdit(customer);
				void goto('/app/clients', { replaceState: true });
			}
		});
		const stopRetry = customersStore.startRetryLoop();
		let firstRefresh = true;
		const unsub = refreshTrigger.subscribe(() => {
			if (firstRefresh) {
				firstRefresh = false;
				return;
			}
			void customersStore.revalidate();
		});
		const stuckIntervalId = setInterval(() => {
			const st = get(customersStatus);
			const stuck = (st === 'loading' || st === 'refreshing') && get(customersStore).length === 0 && Date.now() - loadStartedAt > CLIENTS_STUCK_RELOAD_MS;
			if (!stuck) return;
			tryPosSelfHealReload(CLIENTS_SELFHEAL_SCREEN_KEY);
		}, 2_000);
		return () => {
			stopRetry();
			unsub();
			clearInterval(stuckIntervalId);
		};
	});
</script>

<div class="space-y-4">
	<div class="panel p-4">
		<h1 class="text-base font-semibold">Clientes</h1>
		<p class="text-xs text-slate-500 dark:text-slate-400">
			Teléfono, dirección y datos de entrega para los pedidos.
		</p>
		{#if $customersStatus === 'error' && $customersLoadError}
			<div class="mt-2 flex flex-wrap items-center gap-2">
				<p class="text-sm text-amber-600 dark:text-amber-400">
					Sin conexión o error al cargar clientes. Mostrando datos guardados si hay.
				</p>
				<button
					type="button"
					class="btn-secondary !py-1.5 text-sm"
					onclick={() => void customersStore.revalidate()}
				>
					Reintentar
				</button>
			</div>
		{/if}
	</div>

	<div class="panel p-4">
		<DataTable
			tableId="clientes"
			data={displayList}
			columns={columns}
			rowId={(c) => c.id}
			actions={[
				{ label: 'Crear pedido', onClick: createOrderWith, variant: 'default', icon: 'plus' },
				{ label: 'Editar', onClick: openEdit, variant: 'secondary', icon: 'edit' }
			]}
			emptyMessage={clientSearchLoading ? 'Buscando…' : clientSearchError ? 'Error de conexión al buscar. Revisá la red y reintentá.' : searchDigits.length >= 4 ? 'Sin resultados para este teléfono.' : 'No hay clientes. Creá uno con «Nuevo cliente».'}
			loading={loading}
			persistState={true}
		>
			{#snippet toolbarLeft()}
				<input
					class="input min-w-[14rem] max-w-xs w-full"
					type="search"
					placeholder="Buscar por teléfono (ej. 1128939337)"
					bind:value={clientSearchQuery}
					aria-label="Buscar cliente"
				/>
			{/snippet}
			{#snippet toolbarActions()}
				<button type="button" class="btn-primary" onclick={openNew}>Nuevo cliente</button>
			{/snippet}
		</DataTable>
	</div>
</div>

<Dialog.Root bind:open={newClientModalOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-black/50" />
		<Dialog.Content
			class="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-neutral-700 dark:bg-black"
			aria-describedby="new-client-modal-desc"
			aria-labelledby="new-client-modal-title"
		>
			<h2 id="new-client-modal-title" class="mb-4 text-lg font-semibold">Buscar o agregar cliente</h2>
			{#if modalSaving}
				<div id="new-client-modal-desc" class="flex flex-col items-center justify-center gap-3 py-8">
					<div class="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600 dark:border-neutral-600 dark:border-t-blue-400" aria-hidden="true"></div>
					<p class="text-sm text-slate-600 dark:text-slate-400">Creando cliente…</p>
				</div>
			{:else if addClientMode}
				<div id="new-client-modal-desc" class="space-y-3">
					<label class="block">
						<span class="mb-1 block text-sm text-slate-600 dark:text-slate-400">Teléfono</span>
						<input
							class="input w-full"
							type="tel"
							inputmode="numeric"
							pattern="[0-9]*"
							placeholder="Solo números"
							value={newClientForm.phone}
							onkeydown={(e) => {
								if (e.key === 'Backspace' || e.key === 'Delete' || e.key === 'Tab' || e.key.startsWith('Arrow') || (e.ctrlKey || e.metaKey) && ['a', 'c', 'v', 'x'].includes(e.key.toLowerCase())) return;
								if (!/^\d$/.test(e.key)) e.preventDefault();
							}}
							oninput={(e) => {
								const v = (e.currentTarget as HTMLInputElement).value.replace(/\D/g, '');
								newClientForm = { ...newClientForm, phone: v };
							}}
						/>
					</label>
					<label class="block">
						<span class="mb-1 block text-sm text-slate-600 dark:text-slate-400">Dirección</span>
						<input class="input w-full" type="text" bind:value={newClientForm.address} placeholder="Calle y número" />
					</label>
					<label class="block">
						<span class="mb-1 block text-sm text-slate-600 dark:text-slate-400">Entre calles (opcional)</span>
						<input class="input w-full" type="text" bind:value={newClientForm.betweenStreets} placeholder="Ej: Av. X y Calle Y" />
					</label>
					<label class="block">
						<span class="mb-1 block text-sm text-slate-600 dark:text-slate-400">Observación (opcional)</span>
						<input class="input w-full" type="text" bind:value={newClientForm.notes} placeholder="Referencias" />
					</label>
					{#if existingCustomerByPhoneLookupLoading && !existingCustomerWhenAdding}
						<p class="text-sm text-slate-500 dark:text-slate-400">Comprobando si el teléfono ya existe…</p>
					{:else if existingCustomerWhenAdding}
						<div class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
							<p class="font-medium">Este cliente ya existe</p>
							<p class="mt-1 text-xs opacity-90">
								Tel: {existingCustomerWhenAdding.phone} — {existingCustomerWhenAdding.address}
							</p>
							<button
								type="button"
								class="btn-primary mt-2 w-full"
								onclick={() => useExistingClient(existingCustomerWhenAdding)}
							>
								Usar este cliente
							</button>
						</div>
					{/if}
					<div class="flex gap-2 pt-2">
						<button type="button" class="btn-secondary flex-1" onclick={() => (addClientMode = false)}>
							Volver
						</button>
						<button
							type="button"
							class="btn-primary flex-1"
							onclick={() => createNewClientFromModal()}
							disabled={!!existingCustomerWhenAdding || modalSaving}
						>
							{modalSaving ? 'Guardando…' : 'Crear y usar'}
						</button>
					</div>
				</div>
			{:else}
				<div id="new-client-modal-desc" class="space-y-3">
					<input
						class="input w-full"
						type="search"
						placeholder="Buscar por teléfono o dirección..."
						bind:value={modalClientSearch}
						aria-label="Buscar cliente"
					/>
					<div class="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-200 dark:border-neutral-700">
						{#if ($customersStatus === 'loading' || $customersStatus === 'refreshing') && $customersStore.length === 0}
							<p class="px-3 py-4 text-center text-sm text-slate-500 dark:text-slate-400">
								Cargando clientes…
							</p>
						{:else if modalLookupLoading && modalClientsToShow.length === 0}
							<p class="px-3 py-4 text-center text-sm text-slate-500 dark:text-slate-400">
								Buscando…
							</p>
						{:else}
							{#each modalClientsToShow as customer}
								<button
									type="button"
									class="w-full rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-slate-100 dark:hover:bg-neutral-800"
									onclick={() => useExistingClient(customer)}
								>
									<p class="font-medium">{customer.phone}</p>
									<p class="text-xs text-slate-500 dark:text-slate-400">{customer.address}</p>
									{#if customer.betweenStreets?.trim()}
										<p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Entre calles: {customer.betweenStreets.trim()}</p>
									{/if}
									{#if customer.notes?.trim()}
										<p class="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">Obs: {customer.notes.trim()}</p>
									{/if}
								</button>
							{/each}
							{#if modalClientsToShow.length === 0}
								{#if $customersStore.length === 0 && ($customersStatus === 'idle' || $customersStatus === 'error')}
									<div class="px-3 py-4 text-center text-sm text-slate-500 dark:text-slate-400">
										<p>No se cargaron los clientes.</p>
										<button
											type="button"
											class="btn-secondary mt-2 !py-1.5 text-xs"
											onclick={() => void customersStore.revalidate()}
										>
											Reintentar
										</button>
									</div>
								{:else}
									<p class="px-3 py-4 text-center text-sm text-slate-500 dark:text-slate-400">
										Ningún cliente coincide. Agregá uno nuevo.
									</p>
								{/if}
							{/if}
						{/if}
					</div>
					<button type="button" class="btn-secondary w-full" onclick={() => (addClientMode = true)}>
						Agregar cliente nuevo
					</button>
				</div>
			{/if}
			<div class="mt-4 flex justify-end">
				<Dialog.Close class="btn-secondary" disabled={modalSaving}>Cerrar</Dialog.Close>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<SideDrawer bind:open={drawerOpen} title={editing ? 'Editar cliente' : 'Nuevo cliente'}>
	<div class="space-y-3">
		<label class="block space-y-1">
			<span class="text-sm font-medium text-slate-700 dark:text-neutral-300">Teléfono</span>
			<input
				class="input"
				type="tel"
				inputmode="numeric"
				pattern="[0-9]*"
				placeholder="Solo números"
				value={form.phone}
				oninput={(e) => {
					const v = (e.currentTarget as HTMLInputElement).value.replace(/\D/g, '');
					form = { ...form, phone: v };
				}}
			/>
		</label>
		<label class="block space-y-1">
			<span class="text-sm font-medium text-slate-700 dark:text-neutral-300">Dirección</span>
			<input class="input" bind:value={form.address} />
		</label>
		<label class="block space-y-1">
			<span class="text-sm font-medium text-slate-700 dark:text-neutral-300">Entre calles</span>
			<input class="input" bind:value={form.betweenStreets} />
		</label>
		<label class="block space-y-1">
			<span class="text-sm font-medium text-slate-700 dark:text-neutral-300">Observación</span>
			<textarea class="input min-h-24" bind:value={form.notes}></textarea>
		</label>
		<button class="btn-primary" onclick={save} disabled={saving}>
			{saving ? 'Guardando…' : 'Guardar'}
		</button>
	</div>
</SideDrawer>
