<script lang="ts">
	import SideDrawer from '$lib/components/SideDrawer.svelte';
	import { DataTable } from '$lib/components/table';
	import type { DataTableColumn } from '$lib/components/table';
	import { staffStore } from '$lib/stores/staff';
	import { sessionStore } from '$lib/stores/session';
	import { toastsStore } from '$lib/stores/toasts';
	import type { Staff, StaffRole } from '$lib/types';
	import { onMount } from 'svelte';

	let drawerOpen = $state(false);
	let loading = $state(true);
	let editing = $state<Staff | null>(null);
	let form = $state<{ name: string; role: StaffRole; active: boolean }>({
		name: '',
		role: 'CAJERO',
		active: true
	});

	const canManage = $derived($sessionStore.user?.role === 'ADMINISTRADOR');

	const columns: DataTableColumn<Staff>[] = [
		{ id: 'name', header: 'Nombre', accessorKey: 'name' },
		{ id: 'email', header: 'Email', accessorFn: (r) => r.email ?? '—' },
		{ id: 'role', header: 'Rol', accessorKey: 'role' },
		{ id: 'active', header: 'Activo', accessorFn: (r) => (r.active ? 'Sí' : 'No') }
	];

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
		try {
			await staffStore.load();
		} finally {
			loading = false;
		}
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

	<div class="panel p-4">
		<DataTable
			tableId="equipo"
			data={$staffStore}
			columns={columns}
			rowId={(r) => r.id}
			globalSearch={{ keys: ['name', 'email', 'role'], placeholder: 'Buscar por nombre o email' }}
			actions={[{ label: 'Editar', onClick: openEdit, variant: 'secondary' }]}
			emptyMessage="No hay miembros cargados. Si deberías ver datos, probá cerrar sesión y volver a entrar."
			loading={loading}
			persistState={true}
		/>
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
		<button class="btn-primary" onclick={save} disabled={!canManage}>Guardar</button>
	</div>
</SideDrawer>
