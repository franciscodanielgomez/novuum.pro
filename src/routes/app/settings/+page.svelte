<script lang="ts">
	import { api } from '$lib/api';
	import { businessStore } from '$lib/stores/business';
	import { toastsStore } from '$lib/stores/toasts';
	import {
		isTauri,
		listPrinters,
		printTicket,
		getSavedPrinterName,
		setSavedPrinterName
	} from '$lib/printing/printer';
	import { demoTicketText } from '$lib/printing/ticket-layout';
	import { isUpdaterAvailable } from '$lib/updater';
	import { updateStore } from '$lib/stores/updateStore';
	import { get } from 'svelte/store';
	import { onMount } from 'svelte';
	import { getPosSelfHealEnabled, setPosSelfHealEnabled } from '$lib/pos/self-heal';

	type PaymentMethod = { id: string; name: string; sort_order: number; active: boolean };

	let paymentMethods = $state<PaymentMethod[]>([]);
	let newMethodName = $state('');
	let shippingPriceInput = $state('');
	let loading = $state(true);
	let loadError = $state(false);
	let savingShipping = $state(false);
	let savingMethod = $state(false);

	// Impresión de ticket (tamaño y márgenes, guardados en business_settings; defaults como VB: 5, 40)
	let ticketFontSizeInput = $state('30');
	let ticketMarginLeftInput = $state('5');
	let ticketMarginRightInput = $state('40');
	let savingTicketPrint = $state(false);

	// Impresión (Tauri + fallback web)
	let printers = $state<string[]>([]);
	let selectedPrinter = $state<string>('');
	let savedPrinterDisplay = $state<string>('');
	let detectingPrinters = $state(false);
	let printingTest = $state(false);
	let selfHealEnabled = $state(true);

	// Actualizaciones (solo Desktop): usa updateStore (estado compartido con el menú de perfil)
	let installingUpdate = $state(false);

	async function doCheckUpdate() {
		if (!isUpdaterAvailable()) return;
		await updateStore.manualCheck();
		if ($updateStore.status === 'update-available') toastsStore.success(`Hay una actualización: ${$updateStore.updateInfo?.version ?? ''}`);
		else if ($updateStore.status === 'updated') toastsStore.success('Estás al día');
		else if ($updateStore.status === 'error') toastsStore.error($updateStore.errorMessage ?? 'Error al buscar');
	}

	async function doInstallUpdate() {
		if ($updateStore.status !== 'update-available') return;
		installingUpdate = true;
		try {
			await updateStore.installUpdate();
			toastsStore.success('Actualización instalada. La app se reiniciará.');
		} catch (e) {
			toastsStore.error(e instanceof Error ? e.message : 'Error al instalar');
		} finally {
			installingUpdate = false;
		}
	}

	async function detectPrinters() {
		detectingPrinters = true;
		try {
			printers = await listPrinters();
			if (printers.length > 0 && !selectedPrinter) selectedPrinter = printers[0];
			if (isTauri() && printers.length === 0) toastsStore.error('No se detectaron impresoras');
			else if (isTauri()) toastsStore.success(`${printers.length} impresora(s) detectada(s)`);
		} catch (e) {
			toastsStore.error(e instanceof Error ? e.message : 'Error al detectar impresoras');
		} finally {
			detectingPrinters = false;
		}
	}

	function savePrinterChoice() {
		if (selectedPrinter) {
			setSavedPrinterName(selectedPrinter);
			savedPrinterDisplay = selectedPrinter;
			toastsStore.success('Impresora guardada');
		}
	}

	async function printTestTicket() {
		printingTest = true;
		try {
			await printTicket(demoTicketText(), selectedPrinter || undefined);
			if (isTauri()) toastsStore.success('Ticket enviado a impresora');
			else toastsStore.success('Se abrió la vista de impresión');
		} catch (e) {
			toastsStore.error(e instanceof Error ? e.message : 'Error al imprimir');
		} finally {
			printingTest = false;
		}
	}

	async function loadPaymentMethods() {
		try {
			const data = await api.paymentMethods.listActive();
			paymentMethods = data.map((r) => ({
				id: r.id,
				name: r.name,
				sort_order: r.sort_order ?? 0,
				active: r.active ?? true
			}));
		} catch {
			paymentMethods = [];
		}
	}

	async function saveShippingPrice() {
		const num = Number(String(shippingPriceInput).replace(',', '.'));
		if (Number.isNaN(num) || num < 0) {
			toastsStore.error('Ingresá un precio válido (número mayor o igual a 0).');
			return;
		}
		savingShipping = true;
		try {
			const ok = await businessStore.updateShippingPrice(num);
			if (ok) {
				toastsStore.success('Precio de envío actualizado');
				shippingPriceInput = String($businessStore.shippingPrice);
			} else {
				toastsStore.error('No se pudo guardar el precio de envío');
			}
		} catch (e) {
			toastsStore.error(e instanceof Error ? e.message : 'No se pudo guardar. Comprobá la conexión.');
		} finally {
			savingShipping = false;
		}
	}

	async function addPaymentMethod() {
		const name = newMethodName.trim();
		if (!name) {
			toastsStore.error('Escribí el nombre del método de pago');
			return;
		}
		savingMethod = true;
		try {
			const maxOrder = paymentMethods.length > 0 ? Math.max(...paymentMethods.map((p) => p.sort_order)) : -1;
			const data = await api.paymentMethods.create({ name, sort_order: maxOrder + 1, active: true });
			paymentMethods = [
				...paymentMethods,
				{ id: data.id, name: data.name, sort_order: data.sort_order ?? 0, active: data.active ?? true }
			];
			newMethodName = '';
			toastsStore.success('Método de pago agregado');
		} catch (error) {
			toastsStore.error(error instanceof Error && error.message ? error.message : 'No se pudo agregar el método de pago');
		} finally {
			savingMethod = false;
		}
	}

	async function deletePaymentMethod(id: string) {
		try {
			await api.paymentMethods.remove(id);
			paymentMethods = paymentMethods.filter((p) => p.id !== id);
			toastsStore.success('Método de pago eliminado');
		} catch (error) {
			toastsStore.error(error instanceof Error && error.message ? error.message : 'No se pudo eliminar');
		}
	}

	async function refreshSettingsData() {
		loadError = false;
		try {
			await businessStore.load();
			const s = get(businessStore);
			shippingPriceInput = String(s.shippingPrice);
			ticketFontSizeInput = String(s.ticketFontSizePt ?? 30);
			ticketMarginLeftInput = String(s.ticketMarginLeft ?? 5);
			ticketMarginRightInput = String(s.ticketMarginRight ?? 40);
			await loadPaymentMethods();
		} catch {
			loadError = true;
			toastsStore.error('Error al cargar configuraciones. Revisá la conexión.');
		}
	}

	async function saveTicketPrintSettings() {
		const fontPt = Math.round(Number(String(ticketFontSizeInput).replace(',', '.')));
		const marginL = Math.round(Number(String(ticketMarginLeftInput).replace(',', '.')));
		const marginR = Math.round(Number(String(ticketMarginRightInput).replace(',', '.')));
		if (Number.isNaN(fontPt) || fontPt < 9 || fontPt > 40) {
			toastsStore.error('Tamaño de letra debe estar entre 9 y 40 pt');
			return;
		}
		if (Number.isNaN(marginL) || marginL < 0 || marginL > 100 || Number.isNaN(marginR) || marginR < 0 || marginR > 100) {
			toastsStore.error('Márgenes deben estar entre 0 y 100');
			return;
		}
		savingTicketPrint = true;
		try {
			const result = await businessStore.updateTicketPrintSettings(fontPt, marginL, marginR);
			if (result.ok) {
				toastsStore.success('Configuración de impresión del ticket guardada');
				ticketFontSizeInput = String(fontPt);
				ticketMarginLeftInput = String(marginL);
				ticketMarginRightInput = String(marginR);
			} else {
				toastsStore.error(result.error);
			}
		} catch (e) {
			toastsStore.error(e instanceof Error ? e.message : 'No se pudo guardar. Comprobá la conexión.');
		} finally {
			savingTicketPrint = false;
		}
	}

	onMount(() => {
		selfHealEnabled = getPosSelfHealEnabled();
		// Mostrar el formulario al instante con datos del store (layout ya suele tenerlos)
		const store = get(businessStore);
		shippingPriceInput = String(store.shippingPrice);
		ticketFontSizeInput = String(store.ticketFontSizePt ?? 30);
		ticketMarginLeftInput = String(store.ticketMarginLeft ?? 5);
		ticketMarginRightInput = String(store.ticketMarginRight ?? 40);
		const saved = getSavedPrinterName() ?? '';
		selectedPrinter = saved;
		savedPrinterDisplay = saved;
		loading = false;

		void refreshSettingsData();
		// Carga al montar; sin refreshTrigger global (always-on POS).
		return () => {};
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
	{:else if loadError}
		<div class="panel rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40">
			<p class="text-sm text-amber-800 dark:text-amber-200">No se pudieron cargar los datos. Probá reconectar o recargar la página.</p>
			<div class="mt-3 flex flex-wrap gap-2">
				<button type="button" class="btn-primary" onclick={() => void refreshSettingsData()}>
					Reintentar
				</button>
				<button type="button" class="btn-secondary" onclick={() => window.location.reload()}>
					Recargar página
				</button>
			</div>
		</div>
	{:else}
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
			<!-- Impresión (Tauri nativo / web fallback) -->
			<section class="panel min-w-0 p-6 md:col-span-2">
				<h2 class="text-sm font-semibold text-slate-800 dark:text-slate-200">Impresión</h2>
				<p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
					{#if isTauri()}
						App desktop: impresión nativa sin diálogo. Elegí la impresora y guardá.
					{:else}
						Versión web: al imprimir se abre una pestaña y el diálogo del navegador (fallback).
					{/if}
				</p>
				{#if isTauri() && savedPrinterDisplay}
					<p class="mt-1 text-xs text-slate-600 dark:text-slate-300">
						Impresora actual: <strong>{savedPrinterDisplay}</strong>
					</p>
				{/if}
				<div class="mt-3 flex flex-wrap items-end gap-2">
					{#if isTauri()}
						<button
							type="button"
							class="btn-secondary"
							disabled={detectingPrinters}
							onclick={detectPrinters}
						>
							{detectingPrinters ? 'Detectando…' : 'Detectar impresoras'}
						</button>
					{/if}
					{#if printers.length > 0 || selectedPrinter}
						<label class="flex flex-col gap-1">
							<span class="text-xs font-medium text-slate-600 dark:text-slate-300">Impresora</span>
							<select
								class="input w-56"
								bind:value={selectedPrinter}
								onchange={savePrinterChoice}
							>
								<option value="">— Predeterminada —</option>
								{#each printers as name}
									<option value={name}>{name}</option>
								{/each}
							</select>
						</label>
						<button type="button" class="btn-secondary" onclick={savePrinterChoice}>
							Guardar impresora
						</button>
					{/if}
					<button
						type="button"
						class="btn-primary"
						disabled={printingTest}
						onclick={printTestTicket}
					>
						{printingTest ? 'Imprimiendo…' : 'Imprimir prueba A4'}
					</button>
				</div>

				<!-- Impresión de ticket: tamaño y márgenes (guardados en DB) -->
				<div class="mt-6 border-t border-slate-200 pt-4 dark:border-neutral-700">
					<h3 class="text-sm font-medium text-slate-700 dark:text-slate-300">Impresión de ticket</h3>
					<p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
						Tamaño de letra y márgenes del ticket (solo aplican en app desktop con impresora térmica).
					</p>
					<div class="mt-3 flex flex-wrap items-end gap-3">
						<label class="flex flex-col gap-1">
							<span class="text-xs font-medium text-slate-600 dark:text-slate-300">Tamaño de letra (pt)</span>
							<input
								type="number"
								min="9"
								max="40"
								class="input w-24"
								bind:value={ticketFontSizeInput}
							/>
						</label>
						<label class="flex flex-col gap-1">
							<span class="text-xs font-medium text-slate-600 dark:text-slate-300">Margen izquierdo</span>
							<input
								type="number"
								min="0"
								max="100"
								class="input w-24"
								bind:value={ticketMarginLeftInput}
							/>
						</label>
						<label class="flex flex-col gap-1">
							<span class="text-xs font-medium text-slate-600 dark:text-slate-300">Margen derecho</span>
							<input
								type="number"
								min="0"
								max="100"
								class="input w-24"
								bind:value={ticketMarginRightInput}
							/>
						</label>
						<button
							type="button"
							class="btn-primary"
							disabled={savingTicketPrint}
							onclick={saveTicketPrintSettings}
						>
							{savingTicketPrint ? 'Guardando…' : 'Guardar'}
						</button>
					</div>
				</div>
			</section>

			<section class="panel min-w-0 p-6 md:col-span-2">
				<h2 class="text-sm font-semibold text-slate-800 dark:text-slate-200">Auto-recuperación POS</h2>
				<p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
					Si una pantalla queda colgada sin datos, la app puede recargarse automáticamente para recuperarse.
				</p>
				<div class="mt-3 flex items-center gap-3">
					<label class="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							checked={selfHealEnabled}
							onchange={(e) => {
								selfHealEnabled = (e.currentTarget as HTMLInputElement).checked;
								setPosSelfHealEnabled(selfHealEnabled);
								toastsStore.success(selfHealEnabled ? 'Auto-recuperación activada' : 'Auto-recuperación desactivada');
							}}
						/>
						Activar auto-recuperación
					</label>
				</div>
			</section>

			<!-- Actualizaciones (solo Desktop) -->
			{#if isUpdaterAvailable()}
				<section class="panel min-w-0 p-6 md:col-span-2">
					<h2 class="text-sm font-semibold text-slate-800 dark:text-slate-200">Actualizaciones</h2>
					<p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
						Versión instalada y búsqueda de actualizaciones desde GitHub Releases.
					</p>
					<div class="mt-3 space-y-2">
						{#if $updateStore.appVersion}
							<p class="text-sm text-slate-600 dark:text-slate-300">Versión instalada: <strong>{$updateStore.appVersion}</strong></p>
						{/if}
						{#if $updateStore.lastCheckAt}
							<p class="text-xs text-slate-500 dark:text-slate-400">Última búsqueda: {$updateStore.lastCheckAt}</p>
						{/if}
						{#if $updateStore.updateInfo}
							<div class="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/30">
								<p class="text-sm font-medium text-emerald-800 dark:text-emerald-200">Disponible: {$updateStore.updateInfo.version}</p>
								{#if $updateStore.updateInfo.body}
									<p class="mt-1 text-xs text-emerald-700 dark:text-emerald-300 whitespace-pre-wrap">{$updateStore.updateInfo.body}</p>
								{/if}
								<p class="mt-2 text-xs text-slate-500 dark:text-slate-400">Tras instalar la app se cerrará y podés abrirla de nuevo.</p>
								<button
									type="button"
									class="btn-primary mt-2"
									disabled={installingUpdate}
									onclick={doInstallUpdate}
								>
									{installingUpdate ? 'Instalando…' : 'Descargar e instalar'}
								</button>
							</div>
						{/if}
						<button
							type="button"
							class="btn-secondary"
							disabled={$updateStore.status === 'checking'}
							onclick={doCheckUpdate}
						>
							{$updateStore.status === 'checking' ? 'Buscando…' : 'Buscar actualizaciones'}
						</button>
					</div>
				</section>
			{/if}

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
