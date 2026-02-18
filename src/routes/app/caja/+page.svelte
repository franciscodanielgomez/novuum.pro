<script lang="ts">
	import { ordersStore } from '$lib/stores/orders';
	import { shiftsStore } from '$lib/stores/shifts';
	import { staffStore } from '$lib/stores/staff';
	import { toastsStore } from '$lib/stores/toasts';
	import type { PaymentMethod, ShiftTurn } from '$lib/types';
	import { formatMoney } from '$lib/utils';
	import { onMount } from 'svelte';

	let openTurn: ShiftTurn = 'MAÑANA';
	let openCashierId = '';
	let includeNonCompleted = false;

	$: cashiers = $staffStore.filter(
		(s) => s.active && (s.roles ?? [s.role]).some((r) => r === 'CAJERO' || r === 'ADMINISTRADOR' || r === 'GESTOR')
	);
	$: currentShift = $shiftsStore;
	$: shiftOrders = currentShift
		? $ordersStore.filter((o) => o.shiftId === currentShift.id && (includeNonCompleted || o.status === 'COMPLETADO'))
		: [];

	$: totalsByPayment = shiftOrders.reduce<Record<PaymentMethod, number>>(
		(acc, order) => {
			acc[order.paymentMethod] += order.total;
			return acc;
		},
		{ CASH: 0, MP: 0, TRANSFER: 0 }
	);
	$: total = totalsByPayment.CASH + totalsByPayment.MP + totalsByPayment.TRANSFER;

	const openCash = async () => {
		if (!openCashierId) return;
		await shiftsStore.open(openCashierId, openTurn);
		toastsStore.success('Caja abierta');
	};

	const closeCash = async () => {
		if (!currentShift) return;
		await shiftsStore.close(currentShift.id, totalsByPayment, total);
		toastsStore.success('Caja cerrada');
	};

	onMount(async () => {
		await Promise.all([staffStore.load(), shiftsStore.loadOpen(), ordersStore.load()]);
	});
</script>

<div class="space-y-4">
	<div class="panel flex items-center justify-between p-4">
		<div>
			<h1 class="text-base font-semibold">Caja</h1>
			<p class="text-xs text-slate-500 dark:text-slate-400">
				Abrir y cerrar turno, y ver totales por forma de pago del turno actual.
			</p>
		</div>
	</div>

<div class="grid grid-cols-1 gap-4 xl:grid-cols-12">
	<section class="panel xl:col-span-4 p-4">
		<h2 class="text-base font-semibold">Estado de caja</h2>
		{#if !currentShift}
			<p class="mt-2 text-sm text-slate-500">No hay turno abierto.</p>
			<div class="mt-4 space-y-3">
				<label class="block space-y-1">
					<span class="text-sm font-medium">Turno</span>
					<select class="input" bind:value={openTurn}>
						<option value="MAÑANA">MAÑANA</option>
						<option value="TARDE">TARDE</option>
						<option value="NOCHE">NOCHE</option>
					</select>
				</label>
				<label class="block space-y-1">
					<span class="text-sm font-medium">Caja (cajero)</span>
					<select class="input" bind:value={openCashierId}>
						<option value="">Seleccionar</option>
						{#each cashiers as cashier}
							<option value={cashier.id}>{cashier.name}</option>
						{/each}
					</select>
				</label>
				<button class="btn-primary w-full" on:click={openCash}>Abrir caja</button>
			</div>
		{:else}
			<p class="mt-2 text-sm text-slate-600">
				Turno <strong>{currentShift.turn}</strong> abierto a las
				<strong>{new Date(currentShift.openedAt).toLocaleTimeString('es-AR')}</strong>
			</p>
		{/if}
	</section>

	<section class="panel xl:col-span-8 p-4">
		<h2 class="text-base font-semibold">Cierre de caja</h2>
		{#if !currentShift}
			<p class="mt-2 text-sm text-slate-500">Abrí caja para ver el resumen del turno.</p>
		{:else}
			<div class="mt-3 flex items-center gap-2 text-sm">
				<input id="include" type="checkbox" bind:checked={includeNonCompleted} />
				<label for="include">Incluir pedidos no completados</label>
			</div>
			<div class="mt-3 max-h-64 overflow-auto rounded-lg border border-slate-200">
				<table class="min-w-full text-sm">
					<thead class="bg-slate-50">
						<tr>
							<th class="px-3 py-2 text-left">Pedido</th>
							<th class="px-3 py-2 text-left">Estado</th>
							<th class="px-3 py-2 text-left">Medio</th>
							<th class="px-3 py-2 text-left">Total</th>
						</tr>
					</thead>
					<tbody>
						{#each shiftOrders as order}
							<tr class="border-t border-slate-100">
								<td class="px-3 py-2">#{order.orderNumber}</td>
								<td class="px-3 py-2">{order.status}</td>
								<td class="px-3 py-2">{order.paymentMethod}</td>
								<td class="px-3 py-2">{formatMoney(order.total)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
				<div class="rounded-lg bg-slate-50 p-3 text-sm">CASH: {formatMoney(totalsByPayment.CASH)}</div>
				<div class="rounded-lg bg-slate-50 p-3 text-sm">MP: {formatMoney(totalsByPayment.MP)}</div>
				<div class="rounded-lg bg-slate-50 p-3 text-sm">TRANSFER: {formatMoney(totalsByPayment.TRANSFER)}</div>
			</div>
			<p class="mt-3 text-lg font-semibold">Total general: {formatMoney(total)}</p>
			<div class="mt-3 flex gap-2">
				<button class="btn-danger" on:click={closeCash}>Cerrar caja</button>
			</div>
		{/if}
	</section>
</div>
</div>
