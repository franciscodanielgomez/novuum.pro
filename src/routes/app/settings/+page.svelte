<script lang="ts">
	import { businessStore } from '$lib/stores/business';
	import { supabase } from '$lib/supabase/client';
	import { toastsStore } from '$lib/stores/toasts';
	import { onMount } from 'svelte';

	type PaymentMethod = { id: string; name: string; sort_order: number; active: boolean };

	let paymentMethods = $state<PaymentMethod[]>([]);
	let newMethodName = $state('');
	let shippingPriceInput = $state('');
	let loading = $state(true);
	let savingShipping = $state(false);
	let savingMethod = $state(false);

	async function loadPaymentMethods() {
		const { data, error } = await supabase
			.from('payment_methods')
			.select('id, name, sort_order, active')
			.order('sort_order', { ascending: true });
		if (!error && data) {
			paymentMethods = data.map((r) => ({
				id: r.id,
				name: r.name,
				sort_order: r.sort_order ?? 0,
				active: r.active ?? true
			}));
		}
	}

	async function saveShippingPrice() {
		const num = Number(shippingPriceInput.replace(',', '.'));
		if (Number.isNaN(num) || num < 0) {
			toastsStore.error('Ingresá un precio válido (número mayor o igual a 0).');
			return;
		}
		savingShipping = true;
		const ok = await businessStore.updateShippingPrice(num);
		savingShipping = false;
		if (ok) {
			toastsStore.success('Precio de envío actualizado');
			shippingPriceInput = String($businessStore.shippingPrice);
		} else {
			toastsStore.error('No se pudo guardar el precio de envío');
		}
	}

	async function addPaymentMethod() {
		const name = newMethodName.trim();
		if (!name) {
			toastsStore.error('Escribí el nombre del método de pago');
			return;
		}
		savingMethod = true;
		const maxOrder = paymentMethods.length > 0 ? Math.max(...paymentMethods.map((p) => p.sort_order)) : -1;
		const { data, error } = await supabase
			.from('payment_methods')
			.insert({ name, sort_order: maxOrder + 1, active: true })
			.select('id, name, sort_order, active')
			.single();
		savingMethod = false;
		if (!error && data) {
			paymentMethods = [...paymentMethods, { id: data.id, name: data.name, sort_order: data.sort_order ?? 0, active: data.active ?? true }];
			newMethodName = '';
			toastsStore.success('Método de pago agregado');
		} else {
			toastsStore.error(error?.message ?? 'No se pudo agregar el método de pago');
		}
	}

	async function deletePaymentMethod(id: string) {
		const { error } = await supabase.from('payment_methods').delete().eq('id', id);
		if (!error) {
			paymentMethods = paymentMethods.filter((p) => p.id !== id);
			toastsStore.success('Método de pago eliminado');
		} else {
			toastsStore.error(error?.message ?? 'No se pudo eliminar');
		}
	}

	onMount(async () => {
		await businessStore.load();
		shippingPriceInput = String($businessStore.shippingPrice);
		await loadPaymentMethods();
		loading = false;
	});
</script>

<div class="space-y-4">
	<div class="panel flex items-center justify-between p-4">
		<div>
			<h1 class="text-base font-semibold">Configuraciones</h1>
			<p class="text-xs text-slate-500 dark:text-slate-400">
				Métodos de pago y precio de envío para el negocio.
			</p>
		</div>
	</div>

	{#if loading}
		<p class="text-sm text-slate-500 dark:text-slate-400">Cargando…</p>
	{:else}
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
			<!-- Precio de envío -->
			<section class="panel min-w-0 p-6">
			<h2 class="text-sm font-semibold text-slate-800 dark:text-slate-200">Precio del envío</h2>
			<p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
				Monto fijo que se suma al pedido por envío (en la moneda del negocio).
			</p>
			<div class="mt-3 flex flex-wrap items-end gap-2">
				<label class="flex flex-col gap-1">
					<span class="text-xs font-medium text-slate-600 dark:text-slate-300">Precio</span>
					<input
						type="text"
						inputmode="decimal"
						class="input w-32"
						placeholder="0"
						bind:value={shippingPriceInput}
						onkeydown={(e) => e.key === 'Enter' && saveShippingPrice()}
					/>
				</label>
				<button
					class="btn-primary"
					disabled={savingShipping}
					onclick={saveShippingPrice}
				>
					{savingShipping ? 'Guardando…' : 'Guardar'}
				</button>
			</div>
			</section>

			<!-- Métodos de pago -->
			<section class="panel min-w-0 p-6">
			<h2 class="text-sm font-semibold text-slate-800 dark:text-slate-200">Métodos de pago</h2>
			<p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
				Agregá o quitá métodos (Efectivo, Mercadopago, transferencia, etc.).
			</p>

			<ul class="mt-3 space-y-2">
				{#each paymentMethods as pm}
					<li class="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900/50">
						<span class="text-sm font-medium text-slate-800 dark:text-slate-200">{pm.name}</span>
						<button
							type="button"
							class="rounded p-1.5 text-slate-400 hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
							aria-label="Eliminar {pm.name}"
							title="Eliminar"
							onclick={() => deletePaymentMethod(pm.id)}
						>
							<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
								<path d="M10 11v6M14 11v6" />
							</svg>
						</button>
					</li>
				{/each}
			</ul>

			<div class="mt-4 flex flex-wrap items-end gap-2">
				<label class="flex flex-col gap-1">
					<span class="text-xs font-medium text-slate-600 dark:text-slate-300">Nuevo método</span>
					<input
						type="text"
						class="input w-56"
						placeholder="Ej: Transferencia, Tarjeta"
						bind:value={newMethodName}
						onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), addPaymentMethod())}
					/>
				</label>
				<button
					class="btn-primary"
					disabled={savingMethod || !newMethodName.trim()}
					onclick={addPaymentMethod}
				>
					{savingMethod ? 'Agregando…' : 'Agregar'}
				</button>
			</div>
			</section>
		</div>
	{/if}
</div>
