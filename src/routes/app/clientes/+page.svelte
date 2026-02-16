<script lang="ts">
	import SideDrawer from '$lib/components/SideDrawer.svelte';
	import { customerSchema } from '$lib/schemas';
	import { customersStore } from '$lib/stores/customers';
	import { toastsStore } from '$lib/stores/toasts';
	import type { Customer } from '$lib/types';
	import { onMount } from 'svelte';

	let query = '';
	let drawerOpen = false;
	let editing: Customer | null = null;
	let form = { phone: '', address: '', betweenStreets: '', notes: '' };

	$: filtered = $customersStore.filter(
		(c) =>
			!query ||
			c.phone.toLowerCase().includes(query.toLowerCase()) ||
			c.address.toLowerCase().includes(query.toLowerCase())
	);

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
		await customersStore.load();
	});
</script>

<div class="space-y-4">
	<div class="panel p-4">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<input class="input max-w-md" placeholder="Buscar por teléfono o dirección" bind:value={query} />
			<button class="btn-primary" onclick={openNew}>Nuevo cliente</button>
		</div>
	</div>

	<div class="panel overflow-auto">
		<table class="min-w-full text-sm">
			<thead class="bg-slate-50 dark:bg-slate-800">
				<tr>
					<th class="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Teléfono</th>
					<th class="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Dirección</th>
					<th class="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Entre calles</th>
					<th class="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Observación</th>
					<th class="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Acciones</th>
				</tr>
			</thead>
			<tbody>
				{#each filtered as customer}
					<tr class="border-t border-slate-100 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/40">
						<td class="px-3 py-2">{customer.phone}</td>
						<td class="px-3 py-2">{customer.address}</td>
						<td class="px-3 py-2">{customer.betweenStreets ?? '-'}</td>
						<td class="px-3 py-2">{customer.notes ?? '-'}</td>
						<td class="px-3 py-2">
							<button class="btn-secondary !px-2 !py-1 text-xs" onclick={() => openEdit(customer)}>Editar</button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
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
