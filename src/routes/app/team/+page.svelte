<script lang="ts">
	import SideDrawer from '$lib/components/SideDrawer.svelte';
	import { DataTable } from '$lib/components/table';
	import type { DataTableColumn } from '$lib/components/table';
	import { refreshTrigger } from '$lib/stores/refreshTrigger';
	import { staffStore } from '$lib/stores/staff';
	import { staffGuestsStore } from '$lib/stores/staffGuests';
	import { sessionStore } from '$lib/stores/session';
	import { toastsStore } from '$lib/stores/toasts';
	import type { Staff, StaffRole } from '$lib/types';
	import { onMount } from 'svelte';
	import { clearPosSelfHealMark, tryPosSelfHealReload } from '$lib/pos/self-heal';

	type TeamRow = Staff & { isGuest: boolean };

	let drawerOpen = $state(false);
	let addGuestDrawerOpen = $state(false);
	let loading = $state(true);
	let loadStartedAt = $state(0);
	const TEAM_STUCK_RELOAD_MS = 20_000;
	const TEAM_SELFHEAL_SCREEN_KEY = 'team';
	let editing = $state<TeamRow | null>(null);
	let form = $state<{ name: string; email: string; phone: string; roles: StaffRole[]; active: boolean }>({
		name: '',
		email: '',
		phone: '',
		roles: ['CAJERO'],
		active: true
	});
	let newGuestForm = $state<{ name: string; roles: StaffRole[]; email: string; phone: string; active: boolean }>({
		name: '',
		roles: ['CAJERO'],
		email: '',
		phone: '',
		active: true
	});
	const ALL_ROLES: StaffRole[] = ['CAJERO', 'CADETE', 'ADMINISTRADOR', 'GESTOR'];
	/** Administrador y Gestor pueden agregar/editar/eliminar equipo. El Gestor no puede asignar rol Administrador. */
	const canManage = $derived(
		$sessionStore.user?.role === 'ADMINISTRADOR' || $sessionStore.user?.role === 'GESTOR'
	);
	/** Solo el Administrador puede asignar el rol Administrador a otros. */
	const canAssignAdministrator = $derived($sessionStore.user?.role === 'ADMINISTRADOR');
	/** Roles que el usuario puede asignar (el Gestor no ve Administrador). */
	const selectableRoles = $derived(canAssignAdministrator ? ALL_ROLES : ALL_ROLES.filter((r) => r !== 'ADMINISTRADOR'));
	const ROLE_LABELS: Record<StaffRole, string> = {
		CAJERO: 'Cajero',
		CADETE: 'Cadete',
		ADMINISTRADOR: 'Administrador',
		GESTOR: 'Gestor de tienda'
	};
	/** Puede guardar: si es admin, o si está editando su propia fila (para poder pasarse a Administrador) */
	const isEditingSelf = $derived(
		editing != null &&
		!editing.isGuest &&
		($sessionStore.user && (editing.id === $sessionStore.user.id || editing.email === $sessionStore.user.email))
	);
	const canSave = $derived(canManage || isEditingSelf);
	/** Al guardar, si es Gestor no se permite enviar rol Administrador. */
	const rolesToSave = (roles: StaffRole[]): StaffRole[] => {
		const list = $sessionStore.user?.role === 'GESTOR' ? roles.filter((r) => r !== 'ADMINISTRADOR') : roles;
		return list.length > 0 ? list : (['CAJERO'] as StaffRole[]);
	};

	const teamList = $derived.by((): TeamRow[] => {
		const staff = $staffStore.map((s) => ({ ...s, isGuest: false as const }));
		const guests = $staffGuestsStore.map((g) => ({
			id: g.id,
			name: g.name,
			email: g.email,
			phone: g.phone,
			role: g.role,
			roles: g.roles ?? [g.role],
			active: g.active,
			isGuest: true as const
		}));
		return [...staff, ...guests].sort((a, b) => a.name.localeCompare(b.name));
	});

	const columns: DataTableColumn<TeamRow>[] = [
		{ id: 'name', header: 'Nombre', accessorKey: 'name' },
		{ id: 'email', header: 'Email', accessorFn: (r) => (r.email?.trim() ? r.email : (r.isGuest ? '— (sin cuenta)' : '—')) },
		{ id: 'role', header: 'Roles', accessorFn: (r) => (r.roles ?? [r.role]).map((x) => ROLE_LABELS[x] ?? x).join(', ') },
		{ id: 'active', header: 'Activo', accessorFn: (r) => (r.active ? 'Sí' : 'No') }
	];

	const openEdit = (member: TeamRow) => {
		editing = member;
		let roles = (member as { roles?: StaffRole[] }).roles?.length ? (member as { roles: StaffRole[] }).roles : [member.role];
		if (!canAssignAdministrator) roles = roles.filter((r) => r !== 'ADMINISTRADOR');
		if (roles.length === 0) roles = [member.role === 'ADMINISTRADOR' ? 'CAJERO' : member.role];
		form = {
			name: member.name,
			email: (member as { email?: string }).email ?? '',
			phone: (member as { phone?: string }).phone ?? '',
			roles,
			active: member.active
		};
		drawerOpen = true;
	};

	const removeMember = async (member: TeamRow) => {
		if (!confirm(`¿Eliminar a ${member.name} del equipo? Esta acción no se puede deshacer.`)) return;
		try {
			if (member.isGuest) {
				await staffGuestsStore.remove(member.id);
				toastsStore.success('Miembro eliminado');
			} else {
				await staffStore.remove(member.id);
				toastsStore.success('Miembro eliminado del equipo');
			}
			if (editing?.id === member.id) {
				drawerOpen = false;
				editing = null;
			}
		} catch (e) {
			toastsStore.error(e instanceof Error ? e.message : 'No se pudo eliminar.');
		}
	};

	const save = async () => {
		if (!editing) return;
		if (!confirm('¿Está seguro de los cambios?')) return;
		const isEditingSelf = !editing.isGuest && $sessionStore.user && (editing.id === $sessionStore.user.id || editing.email === $sessionStore.user.email);
		try {
			const roles = rolesToSave(form.roles.length > 0 ? form.roles : ['CAJERO']);
			if (editing.isGuest) {
				await staffGuestsStore.update(editing.id, { name: form.name, email: form.email?.trim() || undefined, phone: form.phone?.trim() || undefined, roles, active: form.active });
			} else {
				await staffStore.update(editing.id, { name: form.name, email: form.email || undefined, phone: form.phone || undefined, roles, active: form.active });
			}
			toastsStore.success('Equipo actualizado');
			if (isEditingSelf) {
				sessionStore.updateUserProfile({ name: form.name.trim() || undefined });
			}
		} catch (e) {
			toastsStore.error(e instanceof Error ? e.message : 'No se pudo guardar. ¿Ejecutaste la migración en Supabase?');
		}
		drawerOpen = false;
		editing = null;
	};

	const makeMeAdmin = async () => {
		const uid = $sessionStore.user?.id;
		if (!uid) {
			toastsStore.error('No se detectó tu usuario. Iniciá sesión de nuevo.');
			return;
		}
		const myRow = teamList.find((r) => !r.isGuest && (r.id === uid || r.email === $sessionStore.user?.email));
		if (!myRow) {
			toastsStore.error('No encontré tu usuario en la lista. Probá con Editar en tu fila.');
			return;
		}
		try {
			await staffStore.update(myRow.id, { role: 'ADMINISTRADOR' });
			toastsStore.success('Ahora sos Administrador. Recargá la página si no se actualiza.');
		} catch (e) {
			toastsStore.error(
				'No se pudo. En Supabase → SQL Editor ejecutá: UPDATE public.team_members SET role = \'ADMINISTRADOR\' WHERE email = \'' +
					($sessionStore.user?.email ?? '') +
					'\';'
			);
		}
	};

	const saveNewGuest = async () => {
		if (!newGuestForm.name.trim()) {
			toastsStore.error('El nombre es obligatorio');
			return;
		}
		if (newGuestForm.roles.length === 0) {
			toastsStore.error('Elegí al menos un rol');
			return;
		}
		if (!confirm('¿Confirmar que desea agregar a este miembro?')) return;
		const guestRoles = rolesToSave(newGuestForm.roles);
		await staffGuestsStore.create({
			name: newGuestForm.name.trim(),
			role: guestRoles[0],
			roles: guestRoles,
			email: newGuestForm.email.trim() || undefined,
			phone: newGuestForm.phone.trim() || undefined,
			active: newGuestForm.active
		});
		toastsStore.success('Miembro agregado (sin cuenta)');
		addGuestDrawerOpen = false;
		newGuestForm = { name: '', roles: ['CAJERO'], email: '', phone: '', active: true };
	};

	let refreshUnsub: (() => void) | null = null;
	onMount(() => {
		loadStartedAt = Date.now();
		void (async () => {
			try {
				await Promise.all([staffStore.load(), staffGuestsStore.load()]);
			} finally {
				loading = false;
				if (teamList.length > 0) clearPosSelfHealMark(TEAM_SELFHEAL_SCREEN_KEY);
			}
			let firstRefresh = true;
			refreshUnsub = refreshTrigger.subscribe(() => {
				if (firstRefresh) {
					firstRefresh = false;
					return;
				}
				void Promise.all([staffStore.load(), staffGuestsStore.load()]);
			});
		})();
		const stuckIntervalId = setInterval(() => {
			const stuck = loading && teamList.length === 0 && Date.now() - loadStartedAt > TEAM_STUCK_RELOAD_MS;
			if (!stuck) return;
			tryPosSelfHealReload(TEAM_SELFHEAL_SCREEN_KEY);
		}, 2_000);
		return () => {
			refreshUnsub?.();
			clearInterval(stuckIntervalId);
		};
	});
</script>

<div class="space-y-4">
	<div class="panel flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-base font-semibold">Equipo</h1>
			<p class="text-xs text-slate-500 dark:text-slate-400">
				Miembros con y sin cuenta. Roles: Cajero, Cadete, Administrador, Gestor de tienda.
			</p>
		</div>
		{#if $sessionStore.user?.role !== 'ADMINISTRADOR' && $sessionStore.user?.role !== 'GESTOR'}
			<button type="button" class="btn-secondary shrink-0" onclick={makeMeAdmin} title="Actualizar tu rol a Administrador">
				Hacerme administrador
			</button>
		{/if}
	</div>

	<div class="panel p-4">
		<DataTable
			tableId="equipo"
			data={teamList}
			columns={columns}
			rowId={(r) => r.id}
			globalSearch={{ keys: ['name', 'email', 'role'], placeholder: 'Buscar por nombre o email' }}
			actions={[
				{ label: 'Editar', onClick: openEdit, variant: 'secondary' },
				{ label: 'Eliminar', onClick: removeMember, variant: 'danger' }
			]}
			actionsAsDropdown={true}
			emptyMessage="No hay miembros cargados."
			loading={loading}
			persistState={true}
		>
			{#snippet toolbarActions()}
				{#if canManage}
					<button type="button" class="btn-primary" onclick={() => (addGuestDrawerOpen = true)}>
						Agregar sin cuenta
					</button>
				{/if}
			{/snippet}
		</DataTable>
	</div>
</div>

<SideDrawer bind:open={drawerOpen} title="Editar miembro del equipo">
	<div class="space-y-3">
		{#if editing?.isGuest}
			<p class="text-xs text-slate-500 dark:text-slate-400">Miembro sin cuenta (solo nombre y rol).</p>
		{:else if isEditingSelf}
			<p class="text-xs text-slate-500 dark:text-slate-400">Estás editando tu propio usuario. Podés cambiarte el rol a Administrador y guardar.</p>
		{/if}
		<label class="block space-y-1">
			<span class="text-sm font-medium">Nombre</span>
			<input class="input" bind:value={form.name} />
		</label>
		<label class="block space-y-1">
			<span class="text-sm font-medium">Email (opcional)</span>
			<input class="input" type="email" bind:value={form.email} placeholder="ejemplo@correo.com" />
			{#if !editing?.isGuest}
				<p class="text-xs text-slate-500 dark:text-slate-400">Puede no coincidir con el email de acceso; sirve como contacto.</p>
			{/if}
		</label>
		<label class="block space-y-1">
			<span class="text-sm font-medium">Teléfono (opcional)</span>
			<input class="input" type="tel" bind:value={form.phone} placeholder="Ej. 11 1234-5678" />
		</label>
		<label class="block space-y-1">
			<span class="text-sm font-medium">Roles</span>
			<div class="flex flex-wrap gap-3 pt-1">
				{#each selectableRoles as r}
					<label class="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							checked={form.roles.includes(r)}
							onchange={(e) => {
								const checked = (e.currentTarget as HTMLInputElement).checked;
								if (checked) form.roles = [...form.roles, r];
								else form.roles = form.roles.filter((x) => x !== r);
							}}
						/>
						{ROLE_LABELS[r]}
					</label>
				{/each}
			</div>
			{#if !canAssignAdministrator}
				<p class="text-xs text-slate-500 dark:text-slate-400">Solo un Administrador puede asignar el rol Administrador.</p>
			{/if}
			{#if form.roles.length === 0}
				<p class="text-xs text-amber-600 dark:text-amber-400">Elegí al menos un rol.</p>
			{/if}
		</label>
		<label class="flex items-center gap-2 text-sm">
			<input type="checkbox" bind:checked={form.active} />
			Activo
		</label>
		<button class="btn-primary" onclick={save} disabled={!canSave}>Guardar</button>
	</div>
</SideDrawer>

<SideDrawer bind:open={addGuestDrawerOpen} title="Agregar miembro sin cuenta">
	<p class="mb-3 text-xs text-slate-500 dark:text-slate-400">
		No necesita email ni contraseña. Solo nombre y rol (ej. Cadete, Cajero).
	</p>
	<div class="space-y-3">
		<label class="block space-y-1">
			<span class="text-sm font-medium">Nombre</span>
			<input class="input" bind:value={newGuestForm.name} placeholder="Ej. Juan Pérez" />
		</label>
		<label class="block space-y-1">
			<span class="text-sm font-medium">Email (opcional)</span>
			<input class="input" type="email" bind:value={newGuestForm.email} placeholder="ejemplo@correo.com" />
		</label>
		<label class="block space-y-1">
			<span class="text-sm font-medium">Roles</span>
			<div class="flex flex-wrap gap-3 pt-1">
				{#each selectableRoles as r}
					<label class="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							checked={newGuestForm.roles.includes(r)}
							onchange={(e) => {
								const checked = (e.currentTarget as HTMLInputElement).checked;
								if (checked) newGuestForm.roles = [...newGuestForm.roles, r];
								else newGuestForm.roles = newGuestForm.roles.filter((x) => x !== r);
							}}
						/>
						{ROLE_LABELS[r]}
					</label>
				{/each}
			</div>
			{#if !canAssignAdministrator}
				<p class="text-xs text-slate-500 dark:text-slate-400">Solo un Administrador puede asignar el rol Administrador.</p>
			{/if}
			{#if newGuestForm.roles.length === 0}
				<p class="text-xs text-amber-600 dark:text-amber-400">Elegí al menos un rol.</p>
			{/if}
		</label>
		<label class="block space-y-1">
			<span class="text-sm font-medium">Teléfono (opcional)</span>
			<input class="input" bind:value={newGuestForm.phone} type="tel" placeholder="Ej. 11 1234-5678" />
		</label>
		<label class="flex items-center gap-2 text-sm">
			<input type="checkbox" bind:checked={newGuestForm.active} />
			Activo
		</label>
		<button class="btn-primary" onclick={saveNewGuest}>Agregar</button>
	</div>
</SideDrawer>
