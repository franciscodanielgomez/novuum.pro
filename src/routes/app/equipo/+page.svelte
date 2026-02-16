<script lang="ts">
	import SideDrawer from '$lib/components/SideDrawer.svelte';
	import { staffStore } from '$lib/stores/staff';
	import { sessionStore } from '$lib/stores/session';
	import { toastsStore } from '$lib/stores/toasts';
	import type { Staff, StaffRole } from '$lib/types';
	import { onMount } from 'svelte';

	let drawerOpen = false;
	let editing: Staff | null = null;
	let form: { name: string; role: StaffRole; active: boolean } = {
		name: '',
		role: 'CAJERO',
		active: true
	};

	$: canManage = $sessionStore.user?.role === 'ADMINISTRADOR';

	const openEdit = (member: Staff) => {
		editing = member;
		form = { name: member.name, role: member.role, active: member.active };
		drawerOpen = true;
	};

	const save = async () => {
		if (!editing) return;
		await staffStore.update(editing.id, {
			name: form.name,
			role: form.role,
			active: form.active
		});
		toastsStore.success('Equipo actualizado');
		drawerOpen = false;
	};

	onMount(async () => {
		await staffStore.load();
	});
</script>

<div class="space-y-4">
	<div class="panel flex items-center justify-between p-4">
		<div>
			<h1 class="text-base font-semibold">Equipo</h1>
			<p class="text-xs text-slate-500 dark:text-slate-400">
				Usuarios registrados y permisos (Cajero, Cadete, Administrador, Gestor)
			</p>
		</div>
	</div>

	<div class="panel overflow-auto">
		<table class="min-w-full text-sm">
			<thead class="bg-slate-50 dark:bg-slate-800">
				<tr>
					<th class="px-3 py-2 text-left">Nombre</th>
					<th class="px-3 py-2 text-left">Email</th>
					<th class="px-3 py-2 text-left">Rol</th>
					<th class="px-3 py-2 text-left">Activo</th>
					<th class="px-3 py-2 text-left">Acciones</th>
				</tr>
			</thead>
			<tbody>
				{#each $staffStore as member}
					<tr class="border-t border-slate-100 dark:border-slate-700">
						<td class="px-3 py-2">{member.name}</td>
						<td class="px-3 py-2">{member.email ?? '-'}</td>
						<td class="px-3 py-2">{member.role}</td>
						<td class="px-3 py-2">{member.active ? 'Sí' : 'No'}</td>
						<td class="px-3 py-2">
							<button
								class="btn-secondary !px-2 !py-1 text-xs"
								disabled={!canManage}
								onclick={() => openEdit(member)}
							>
								Editar
							</button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<SideDrawer bind:open={drawerOpen} title="Editar miembro del equipo">
	<div class="space-y-3">
		<label class="block space-y-1">
			<span class="text-sm font-medium">Nombre</span>
			<input class="input" bind:value={form.name} />
		</label>
		<label class="block space-y-1">
			<span class="text-sm font-medium">Rol</span>
			<select class="input" bind:value={form.role}>
				<option value="CAJERO">CAJERO</option>
				<option value="CADETE">CADETE</option>
				<option value="ADMINISTRADOR">ADMINISTRADOR</option>
				<option value="GESTOR">GESTOR</option>
			</select>
		</label>
		<label class="flex items-center gap-2 text-sm">
			<input type="checkbox" bind:checked={form.active} />
			Activo
		</label>
		<button class="btn-primary" onclick={save}>Guardar</button>
	</div>
</SideDrawer>
