<script lang="ts">
	import { api } from '$lib/api';
	import { sessionStore } from '$lib/stores/session';
	import { staffStore } from '$lib/stores/staff';
	import { staffGuestsStore } from '$lib/stores/staffGuests';
	import type { Shift } from '$lib/types';
	import { formatDateTime } from '$lib/utils';
	import { onMount } from 'svelte';

	let shiftsList = $state<Shift[]>([]);

	function loadShifts() {
		void api.shifts.list().then((list) => {
			shiftsList = list;
		});
	}

	function cashierName(shift: Shift): string {
		const staff = $staffStore.find((s) => s.id === shift.cashierStaffId);
		if (staff) return staff.name;
		const guest = $staffGuestsStore.find((g) => g.id === shift.cashierStaffId);
		return guest?.name ?? shift.cashierStaffId;
	}

	// Al abrir o cerrar turno desde el header, actualizar la tabla sin recargar la página.
	$effect(() => {
		$sessionStore.shift;
		loadShifts();
	});

	onMount(() => {
		loadShifts();
	});
</script>

<div class="space-y-4">
	<div class="panel flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-base font-semibold">Turnos</h1>
			<p class="text-xs text-slate-500 dark:text-slate-400">
				Historial de turnos. Abrí o cerrá el turno desde el botón del menú superior.
			</p>
		</div>
	</div>

	<div class="panel p-4">
		<h2 class="text-sm font-semibold">Historial de turnos</h2>
		<div class="mt-3 overflow-auto rounded-lg border border-slate-200 dark:border-neutral-700">
			<table class="min-w-full text-sm">
				<thead class="bg-slate-50 dark:bg-neutral-800/50">
					<tr>
						<th class="px-3 py-2 text-left font-medium">Turno</th>
						<th class="px-3 py-2 text-left font-medium">Cajero</th>
						<th class="px-3 py-2 text-left font-medium">Inicio</th>
						<th class="px-3 py-2 text-left font-medium">Fin</th>
						<th class="px-3 py-2 text-left font-medium">Estado</th>
					</tr>
				</thead>
				<tbody>
					{#each shiftsList as shift}
						<tr class="border-t border-slate-100 dark:border-neutral-700/50">
							<td class="px-3 py-2 font-medium">T{shift.turnNumber}</td>
							<td class="px-3 py-2">{cashierName(shift)}</td>
							<td class="px-3 py-2">{formatDateTime(shift.openedAt)}</td>
							<td class="px-3 py-2">{shift.closedAt ? formatDateTime(shift.closedAt) : '—'}</td>
							<td class="px-3 py-2">{shift.status === 'OPEN' ? 'Abierto' : 'Cerrado'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if shiftsList.length === 0}
			<p class="mt-2 text-sm text-slate-500">Aún no hay turnos registrados.</p>
		{/if}
	</div>
</div>
