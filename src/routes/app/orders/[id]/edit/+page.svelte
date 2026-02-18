<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { ordersStore } from '$lib/stores/orders';
	import { toastsStore } from '$lib/stores/toasts';
	import { formatMoney } from '$lib/utils';
	import { onMount } from 'svelte';

	let notes = '';
	let paymentMethod: 'CASH' | 'MP' | 'TRANSFER' = 'CASH';
	let cashReceived = 0;
	let exists = false;
	let total = 0;
	let orderId = '';
	let orderNumber: number | undefined = undefined;

	onMount(() => {
		void (async () => {
			orderId = page.params.id ?? '';
			await ordersStore.load();
			const order = $ordersStore.find((o) => o.id === orderId);
			if (!order) return;
			exists = true;
			orderNumber = order.orderNumber;
			notes = order.notes ?? '';
			paymentMethod = order.paymentMethod;
			cashReceived = order.cashReceived ?? order.total;
			total = order.total;
		})();
	});

	const save = async () => {
		await ordersStore.update(orderId, {
			notes,
			paymentMethod,
			cashReceived: paymentMethod === 'CASH' ? cashReceived : undefined,
			changeDue: paymentMethod === 'CASH' ? Math.max(0, cashReceived - total) : undefined
		});
		toastsStore.success('Pedido editado');
		await goto('/app/orders');
	};
</script>

<section class="panel max-w-xl p-4">
	<h1 class="text-lg font-semibold">Editar pedido {#if orderNumber}#{orderNumber}{/if}</h1>
	{#if !exists}
		<p class="mt-3 text-sm text-slate-500">Pedido no encontrado</p>
	{:else}
		<div class="mt-4 space-y-3">
			<label class="block space-y-1">
				<span class="text-sm font-medium">Paga con</span>
				<select class="input" bind:value={paymentMethod}>
					<option value="CASH">CASH</option>
					<option value="MP">MP</option>
					<option value="TRANSFER">TRANSFER</option>
				</select>
			</label>
			{#if paymentMethod === 'CASH'}
				<label class="block space-y-1">
					<span class="text-sm font-medium">Paga con $</span>
					<input class="input" type="number" min="0" bind:value={cashReceived} />
					<p class="text-xs text-slate-500">Total: {formatMoney(total)}</p>
				</label>
			{/if}
			<label class="block space-y-1">
				<span class="text-sm font-medium">Observación</span>
				<textarea class="input min-h-24" bind:value={notes}></textarea>
			</label>
			<div class="flex gap-2">
				<button class="btn-primary" on:click={save}>Guardar</button>
				<a class="btn-secondary" href="/app/orders">Cancelar</a>
			</div>
		</div>
	{/if}
</section>
