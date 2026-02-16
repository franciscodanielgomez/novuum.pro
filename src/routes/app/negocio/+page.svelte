<script lang="ts">
	import { businessStore } from '$lib/stores/business';
	import { sessionStore } from '$lib/stores/session';
	import { toastsStore } from '$lib/stores/toasts';
	import { onDestroy, onMount } from 'svelte';

	let companyName = '';
	let branchName = '';
	let logoUrl = '';
	let logoPreviewUrl = '';
	let selectedLogoFile: File | null = null;
	let isSaving = false;
	$: canManageBusiness = Boolean($sessionStore.user);

	const onLogoSelected = (event: Event) => {
		const target = event.currentTarget as HTMLInputElement;
		selectedLogoFile = target.files?.[0] ?? null;
		if (logoPreviewUrl) {
			URL.revokeObjectURL(logoPreviewUrl);
			logoPreviewUrl = '';
		}
		if (selectedLogoFile) {
			logoPreviewUrl = URL.createObjectURL(selectedLogoFile);
		}
	};

	onDestroy(() => {
		if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
	});

	const save = async () => {
		if (isSaving) return;
		if (!canManageBusiness) {
			toastsStore.error('Necesitás iniciar sesión para modificar los datos del negocio');
			return;
		}
		isSaving = true;
		let nextLogoUrl = logoUrl.trim() || null;

		if (selectedLogoFile) {
			const uploaded = await businessStore.uploadLogo(selectedLogoFile);
			if (!uploaded.ok) {
				toastsStore.error(uploaded.message ?? 'No se pudo subir el logo');
				isSaving = false;
				return;
			}
			nextLogoUrl = uploaded.url ?? nextLogoUrl;
			logoUrl = nextLogoUrl ?? '';
		}

		const ok = await businessStore.updateSettings({
			companyName,
			branchName,
			logoUrl: nextLogoUrl
		});
		if (!ok) {
			toastsStore.error('No se pudo guardar la configuracion del negocio');
			isSaving = false;
			return;
		}
		selectedLogoFile = null;
		if (logoPreviewUrl) {
			URL.revokeObjectURL(logoPreviewUrl);
			logoPreviewUrl = '';
		}
		toastsStore.success('Configuracion del negocio actualizada');
		isSaving = false;
	};

	onMount(async () => {
		await businessStore.load();
		companyName = $businessStore.companyName;
		branchName = $businessStore.branchName;
		logoUrl = $businessStore.logoUrl ?? '';
	});
</script>

<section class="panel max-w-2xl p-6">
	<h1 class="text-lg font-semibold">Negocio</h1>
	<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
		Configuracion visible en el sistema: logo, nombre de empresa y sucursal.
	</p>

	<div class="mt-5 space-y-3">
		<label class="block space-y-1">
			<span class="text-sm font-medium">Nombre de empresa</span>
			<input class="input" bind:value={companyName} placeholder="Ej: Grido Delivery" />
		</label>

		<label class="block space-y-1">
			<span class="text-sm font-medium">Nombre de sucursal</span>
			<input class="input" bind:value={branchName} placeholder="Ej: Ituzaingó Centro" />
		</label>

		<label class="block space-y-1">
			<span class="text-sm font-medium">Logo de negocio</span>
			<input class="input" type="file" accept="image/*" onchange={onLogoSelected} />
			<p class="text-xs text-slate-500 dark:text-slate-400">
				Se sube al bucket de Supabase <code>novum-grido</code>. Límite: 50MB.
			</p>
			{#if selectedLogoFile}
				<p class="text-xs text-slate-500 dark:text-slate-400">
					Archivo seleccionado: {selectedLogoFile.name}
				</p>
			{/if}
		</label>

		<div class="flex justify-end">
			<button class="btn-secondary !px-2 !py-1 text-xs" type="button" onclick={() => (logoUrl = '')}>
				Quitar logo
			</button>
		</div>

		<div class="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
			<p class="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">Vista previa</p>
			<div class="flex items-center gap-3">
				{#if logoPreviewUrl}
					<img src={logoPreviewUrl} alt="Logo del negocio" class="h-10 w-10 rounded-full object-cover" />
				{:else if logoUrl.trim()}
					<img src={logoUrl.trim()} alt="Logo del negocio" class="h-10 w-10 rounded-full object-cover" />
				{:else}
					<div class="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white dark:bg-white dark:text-slate-900">
						{companyName.trim().slice(0, 2).toUpperCase() || 'NG'}
					</div>
				{/if}
				<div>
					<p class="text-sm font-semibold text-slate-900 dark:text-slate-100">
						{companyName.trim() || 'Nombre de empresa'}
					</p>
					<p class="text-xs text-slate-500 dark:text-slate-400">{branchName.trim() || 'Sucursal'}</p>
				</div>
			</div>
		</div>

		<button class="btn-primary" disabled={!canManageBusiness || isSaving} onclick={save}>
			{#if isSaving}Guardando...{:else}Guardar cambios{/if}
		</button>

		{#if !canManageBusiness}
			<p class="text-xs text-amber-600 dark:text-amber-400">
				Necesitás iniciar sesión para editar estos datos.
			</p>
		{/if}
	</div>
</section>
