<script lang="ts">
	import { api } from '$lib/api';
	import { sessionStore } from '$lib/stores/session';
	import { staffStore } from '$lib/stores/staff';
	import { staffGuestsStore } from '$lib/stores/staffGuests';
	import type { Shift } from '$lib/types';
	import { formatDateTime, formatMoney } from '$lib/utils';
	import { onMount } from 'svelte';

	let shiftsList = $state<Shift[]>([]);
	let shiftDetailModalShift = $state<Shift | null>(null);
	let shiftDetailStats = $state<{ count: number; total: number } | null>(null);
	let shiftDetailLoading = $state(false);

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

	async function openShiftDetail(shift: Shift) {
		shiftDetailModalShift = shift;
		shiftDetailStats = null;
		shiftDetailLoading = true;
		try {
			const stats = await api.orders.getStatsByShiftId(shift.id);
			shiftDetailStats = stats;
		} catch {
			shiftDetailStats = { count: 0, total: 0 };
		} finally {
			shiftDetailLoading = false;
		}
	}

	function closeShiftDetail() {
		shiftDetailModalShift = null;
		shiftDetailStats = null;
	}

	/** Devuelve la cantidad de horas trabajadas (ej. "2 h 30 min" o "En curso"). */
	function hoursWorked(shift: Shift): string {
		const start = new Date(shift.openedAt).getTime();
		const end = shift.closedAt ? new Date(shift.closedAt).getTime() : Date.now();
		const ms = Math.max(0, end - start);
		const totalMinutes = Math.floor(ms / 60_000);
		const hours = Math.floor(totalMinutes / 60);
		const minutes = totalMinutes % 60;
		if (shift.status === 'OPEN' && !shift.closedAt) {
			return hours > 0 ? `${hours} h ${minutes} min (en curso)` : `${minutes} min (en curso)`;
		}
		return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
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
						<th class="px-3 py-2 text-left font-medium">Horas</th>
						<th class="px-3 py-2 text-left font-medium">Estado</th>
					</tr>
				</thead>
				<tbody>
					{#each shiftsList as shift}
						<tr
							class="cursor-pointer border-t border-slate-100 transition-colors hover:bg-slate-50 dark:border-neutral-700/50 dark:hover:bg-neutral-800/50"
							role="button"
							tabindex="0"
							onclick={() => openShiftDetail(shift)}
							onkeydown={(e) => e.key === 'Enter' && openShiftDetail(shift)}
						>
							<td class="px-3 py-2 font-medium">T{shift.turnNumber}</td>
							<td class="px-3 py-2">{cashierName(shift)}</td>
							<td class="px-3 py-2">{formatDateTime(shift.openedAt)}</td>
							<td class="px-3 py-2">{shift.closedAt ? formatDateTime(shift.closedAt) : '—'}</td>
							<td class="px-3 py-2 tabular-nums">{hoursWorked(shift)}</td>
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

{#if shiftDetailModalShift}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
		role="dialog"
		aria-modal="true"
		aria-labelledby="shift-detail-title"
		onclick={(e) => e.target === e.currentTarget && closeShiftDetail()}
		onkeydown={(e) => e.key === 'Escape' && closeShiftDetail()}
	>
		<div
			class="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-neutral-700 dark:bg-neutral-800"
			onclick={(e) => e.stopPropagation()}
		>
			<h2 id="shift-detail-title" class="text-lg font-semibold">
				Turno T{shiftDetailModalShift.turnNumber}
			</h2>
			<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
				{cashierName(shiftDetailModalShift)} · {shiftDetailModalShift.status === 'OPEN' ? 'Abierto' : 'Cerrado'}
			</p>
			<p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
				{formatDateTime(shiftDetailModalShift.openedAt)}
				{#if shiftDetailModalShift.closedAt}
					— {formatDateTime(shiftDetailModalShift.closedAt)}
				{/if}
			</p>
			<div class="mt-4 border-t border-slate-200 pt-4 dark:border-neutral-700">
				<p class="text-sm font-medium text-slate-700 dark:text-neutral-300">Horas trabajadas</p>
				<p class="mt-1 font-medium tabular-nums">{hoursWorked(shiftDetailModalShift)}</p>
			</div>
			<div class="mt-4 border-t border-slate-200 pt-4 dark:border-neutral-700">
				<p class="text-sm font-medium text-slate-700 dark:text-neutral-300">Pedidos realizados</p>
				<p class="text-xs text-slate-500 dark:text-slate-400">(sin Borradores, ni Cancelados)</p>
				{#if shiftDetailLoading}
					<p class="mt-2 text-sm text-slate-500">Cargando…</p>
				{:else if shiftDetailStats !== null}
					<dl class="mt-2 space-y-1">
						<div class="flex justify-between gap-4">
							<dt class="text-sm text-slate-600 dark:text-slate-400">Cantidad</dt>
							<dd class="font-medium tabular-nums">{shiftDetailStats.count}</dd>
						</div>
						<div class="flex justify-between gap-4">
							<dt class="text-sm text-slate-600 dark:text-slate-400">Suma total</dt>
							<dd class="font-medium tabular-nums">{formatMoney(shiftDetailStats.total)}</dd>
						</div>
					</dl>
				{/if}
			</div>
			<div class="mt-4 flex justify-end">
				<button
					type="button"
					class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
					onclick={closeShiftDetail}
				>
					Cerrar
				</button>
			</div>
		</div>
	</div>
{/if}
