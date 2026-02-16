<script lang="ts">
	import SideDrawer from '$lib/components/SideDrawer.svelte';
	import { DataTable } from '$lib/components/table';
	import type { DataTableColumn } from '$lib/components/table';
	import { customerSchema } from '$lib/schemas';
	import { customersStore } from '$lib/stores/customers';
	import { toastsStore } from '$lib/stores/toasts';
	import type { Customer } from '$lib/types';
	import { onMount } from 'svelte';

	let drawerOpen = $state(false);
	let loading = $state(true);
	let editing = $state<Customer | null>(null);
	let form = $state({ phone: '', address: '', betweenStreets: '', notes: '' });

	// Garantizar array para DataTable (evitar undefined si el store no está listo).
	let customersList = $state<Customer[]>([]);
	$effect(() => {
		const value = $customersStore;
		customersList = Array.isArray(value) ? value : [];
	});

	const columns: DataTableColumn<Customer>[] = [
		{ id: 'phone', header: 'Teléfono', accessorKey: 'phone' },
		{ id: 'address', header: 'Dirección', accessorKey: 'address' },
		{ id: 'betweenStreets', header: 'Entre calles', accessorFn: (r) => r.betweenStreets ?? '—' },
		{ id: 'notes', header: 'Observación', accessorFn: (r) => r.notes ?? '—' }
	];

	const openNew = () => {
		editing = null;
		form = { phone: '', address: '', betweenStreets: '', notes: '' };
		drawerOpen = true;
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

	const save = async () => {
		const parsed = customerSchema.safeParse(form);
		if (!parsed.success) {
			toastsStore.error(parsed.error.issues[0]?.message ?? 'Datos inválidos');
			return;
		}
		if (editing) {
			await customersStore.update(editing.id, parsed.data);
			toastsStore.success('Cliente actualizado');
		} else {
			await customersStore.create(parsed.data);
			toastsStore.success('Cliente creado');
		}
		drawerOpen = false;
	};

	onMount(async () => {
		try {
			await customersStore.load();
		} finally {
			loading = false;
		}
	});
</script>

<div class="space-y-4">
	<div class="panel p-4">
		<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
			<span class="text-sm text-slate-600 dark:text-slate-400">Clientes</span>
			<button class="btn-primary" onclick={openNew}>Nuevo cliente</button>
		</div>
		<DataTable
			tableId="clientes"
			data={customersList}
			columns={columns}
			rowId={(c) => c.id}
			globalSearch={{ keys: ['phone', 'address', 'betweenStreets', 'notes'], placeholder: 'Buscar por teléfono o dirección' }}
			actions={[{ label: 'Editar', onClick: openEdit, variant: 'secondary' }]}
			emptyMessage="No hay clientes. Creá uno con «Nuevo cliente»."
			loading={loading}
			persistState={true}
		/>
	</div>
</div>

<SideDrawer bind:open={drawerOpen} title={editing ? 'Editar cliente' : 'Nuevo cliente'}>
	<div class="space-y-3">
		<label class="block space-y-1">
			<span class="text-sm font-medium">Teléfono</span>
			<input class="input" bind:value={form.phone} />
		</label>
		<label class="block space-y-1">
			<span class="text-sm font-medium">Dirección</span>
			<input class="input" bind:value={form.address} />
		</label>
		<label class="block space-y-1">
			<span class="text-sm font-medium">Entre calles</span>
			<input class="input" bind:value={form.betweenStreets} />
		</label>
		<label class="block space-y-1">
			<span class="text-sm font-medium">Observación</span>
			<textarea class="input min-h-24" bind:value={form.notes}></textarea>
		</label>
		<button class="btn-primary" onclick={save}>Guardar</button>
	</div>
</SideDrawer>
