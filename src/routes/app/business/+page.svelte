<script lang="ts">
	import { Country, State } from 'country-state-city';
	import { getCountries, getCountryCallingCode } from 'libphonenumber-js/min';
	import { businessStore } from '$lib/stores/business';
	import { sessionStore } from '$lib/stores/session';
	import { supabase } from '$lib/supabase/client';
	import { toastsStore } from '$lib/stores/toasts';
	import { onDestroy, onMount } from 'svelte';

	type BusinessAddress = {
		id: string;
		label: string;
		addressLine: string;
		city: string;
		state: string;
		postalCode: string;
		country: string;
		isPrimary: boolean;
	};

	const DEFAULT_PHONE_COUNTRY = 'AR';

	let companyName = $state('');
	let branchName = $state('');
	let phoneCountryIso = $state(DEFAULT_PHONE_COUNTRY);
	let phoneNumber = $state('');
	let logoUrl = $state('');
	let logoPreviewUrl = '';
	let selectedLogoFile: File | null = null;
	let isSaving = false;
	let addresses = $state<BusinessAddress[]>([]);
	let newAddress = $state({
		label: '',
		addressLine: '',
		city: '',
		postalCode: ''
	});
	let newAddressCountryIso = $state('AR');
	let newAddressStateIso = $state('');
	let isSavingAddress = $state(false);
	let phoneCountryOpen = $state(false);
	let phoneCountryQuery = $state('');
	const canManageBusiness = $derived(Boolean($sessionStore.user));

	const toFlag = (iso: string) =>
		iso.toUpperCase().replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));

	const regionNames =
		typeof Intl !== 'undefined' && 'DisplayNames' in Intl
			? new Intl.DisplayNames(['es'], { type: 'region' })
			: null;

	const phoneCountryOptions = getCountries()
		.map((iso) => {
			const dialCode = `+${getCountryCallingCode(iso)}`;
			const countryName = regionNames?.of(iso) ?? iso;
			return { iso, dialCode, name: countryName, flag: toFlag(iso) };
		})
		.sort((a, b) => a.name.localeCompare(b.name, 'es'));

	const getDialCodeByCountry = (iso: string) =>
		phoneCountryOptions.find((o) => o.iso === iso)?.dialCode ?? '+54';

	const filterPhoneCountries = (query: string) => {
		const term = query.trim().toLowerCase();
		if (!term) return phoneCountryOptions;
		return phoneCountryOptions.filter(
			(c) =>
				c.name.toLowerCase().includes(term) ||
				c.dialCode.includes(term) ||
				c.iso.toLowerCase().includes(term)
		);
	};

	const splitPhone = (raw: string | null | undefined) => {
		const value = (raw ?? '').trim();
		if (!value) return { country: DEFAULT_PHONE_COUNTRY, number: '' };
		const match = value.match(/^(\+\d{1,4})\s*(.*)$/);
		if (!match) return { country: DEFAULT_PHONE_COUNTRY, number: value };
		const dialCode = match[1];
		const country = phoneCountryOptions.find((o) => o.dialCode === dialCode)?.iso ?? DEFAULT_PHONE_COUNTRY;
		return { country, number: (match[2] ?? '').trim() };
	};

	const joinPhone = (countryIso: string, number: string) => {
		const n = number.trim();
		if (!n) return null;
		return `${getDialCodeByCountry(countryIso)} ${n}`;
	};

	const filteredPhoneCountries = $derived(filterPhoneCountries(phoneCountryQuery));
	const selectedPhoneCountry = $derived(
		phoneCountryOptions.find((c) => c.iso === phoneCountryIso) ?? phoneCountryOptions[0]
	);

	// Sincronizar formulario con los datos del negocio ya guardados (store)
	$effect(() => {
		const store = $businessStore;
		companyName = store.companyName ?? '';
		branchName = store.branchName ?? '';
		logoUrl = store.logoUrl ?? '';
		const parsed = splitPhone(store.phone ?? '');
		phoneCountryIso = parsed.country;
		phoneNumber = parsed.number;
	});

	const addressCountryOptions = Country.getAllCountries()
		.map((c) => ({ iso: c.isoCode, name: c.name, flag: toFlag(c.isoCode) }))
		.sort((a, b) => a.name.localeCompare(b.name, 'es'));

	const addressStateOptions = $derived(
		State.getStatesOfCountry(newAddressCountryIso)
			.map((s) => ({ iso: s.isoCode, name: s.name }))
			.sort((a, b) => a.name.localeCompare(b.name, 'es'))
	);

	$effect(() => {
		const opts = addressStateOptions;
		if (opts.length === 0) {
			newAddressStateIso = '';
		} else if (!opts.some((s) => s.iso === newAddressStateIso)) {
			newAddressStateIso = opts[0]?.iso ?? '';
		}
	});

	const selectedAddressCountry = $derived(
		addressCountryOptions.find((c) => c.iso === newAddressCountryIso) ?? addressCountryOptions[0]
	);

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

	async function loadAddresses(businessSettingsId: string) {
		const { data, error } = await supabase
			.from('business_addresses')
			.select('id, label, address_line, city, state, postal_code, country, is_primary')
			.eq('business_settings_id', businessSettingsId)
			.order('is_primary', { ascending: false })
			.order('created_at', { ascending: true });
		if (error) {
			toastsStore.error(error.message ?? 'No se pudieron cargar las direcciones');
			addresses = [];
			return;
		}
		addresses = (data ?? []).map((r) => ({
			id: r.id,
			label: r.label ?? '',
			addressLine: r.address_line ?? '',
			city: r.city ?? '',
			state: r.state ?? '',
			postalCode: r.postal_code ?? '',
			country: r.country ?? '',
			isPrimary: r.is_primary ?? false
		}));
	}

	async function addAddress() {
		if (isSavingAddress) return;
		const settingsId = $businessStore.id;
		if (!settingsId) {
			toastsStore.error('Guardá primero los datos del negocio para agregar direcciones');
			return;
		}
		if (!newAddress.label.trim() || !newAddress.addressLine.trim()) {
			toastsStore.error('Completá al menos etiqueta y dirección');
			return;
		}
		isSavingAddress = true;
		const stateName = addressStateOptions.find((s) => s.iso === newAddressStateIso)?.name ?? null;
		const { error } = await supabase.from('business_addresses').insert({
			business_settings_id: settingsId,
			label: newAddress.label.trim(),
			address_line: newAddress.addressLine.trim(),
			city: newAddress.city.trim() || null,
			state: stateName,
			postal_code: newAddress.postalCode.trim() || null,
			country: selectedAddressCountry?.name ?? null,
			is_primary: addresses.length === 0
		});
		isSavingAddress = false;
		if (error) {
			toastsStore.error(error.message ?? 'No se pudo guardar la dirección');
			return;
		}
		newAddress = { label: '', addressLine: '', city: '', postalCode: '' };
		newAddressCountryIso = 'AR';
		newAddressStateIso = '';
		await loadAddresses(settingsId);
		toastsStore.success('Dirección agregada');
	}

	async function removeAddress(id: string) {
		const settingsId = $businessStore.id;
		if (!settingsId) return;
		const { error } = await supabase.from('business_addresses').delete().eq('id', id);
		if (error) {
			toastsStore.error(error.message ?? 'No se pudo eliminar');
			return;
		}
		addresses = addresses.filter((a) => a.id !== id);
		toastsStore.success('Dirección eliminada');
	}

	async function setPrimaryAddress(id: string) {
		const settingsId = $businessStore.id;
		if (!settingsId) return;
		const { error: unsetError } = await supabase
			.from('business_addresses')
			.update({ is_primary: false })
			.eq('business_settings_id', settingsId);
		if (unsetError) {
			toastsStore.error(unsetError.message ?? 'Error al actualizar');
			return;
		}
		const { error } = await supabase.from('business_addresses').update({ is_primary: true }).eq('id', id);
		if (error) {
			toastsStore.error(error.message ?? 'Error al marcar como principal');
			return;
		}
		addresses = addresses.map((a) => ({ ...a, isPrimary: a.id === id }));
		toastsStore.success('Dirección principal actualizada');
	}

	const save = async () => {
		if (isSaving) return;
		if (!canManageBusiness) {
			toastsStore.error('Necesitás iniciar sesión para modificar los datos del negocio');
			return;
		}
		isSaving = true;
		let nextLogoUrl = logoUrl.trim() || null;
		try {
			if (selectedLogoFile) {
				const uploaded = await businessStore.uploadLogo(selectedLogoFile, logoUrl.trim() || null);
				if (!uploaded.ok) {
					toastsStore.error(uploaded.message ?? 'No se pudo subir el logo');
					return;
				}
				nextLogoUrl = uploaded.url ?? nextLogoUrl;
				logoUrl = nextLogoUrl ?? '';
			}

			const ok = await businessStore.updateSettings({
				companyName,
				branchName,
				logoUrl: nextLogoUrl,
				shippingPrice: $businessStore.shippingPrice,
				phone: joinPhone(phoneCountryIso, phoneNumber),
				ticketFontSizePt: $businessStore.ticketFontSizePt,
				ticketMarginLeft: $businessStore.ticketMarginLeft,
				ticketMarginRight: $businessStore.ticketMarginRight
			});
			if (!ok) {
				toastsStore.error('No se pudo guardar la configuracion del negocio');
				return;
			}
			selectedLogoFile = null;
			if (logoPreviewUrl) {
				URL.revokeObjectURL(logoPreviewUrl);
				logoPreviewUrl = '';
			}
			toastsStore.success('Configuracion del negocio actualizada');
		} catch (e) {
			toastsStore.error(e instanceof Error ? e.message : 'No se pudo guardar. Comprobá la conexión.');
		} finally {
			isSaving = false;
		}
	};

	onMount(async () => {
		await businessStore.load();
		const id = $businessStore.id;
		if (id) await loadAddresses(id);
	});
</script>

<div class="space-y-4">
	<div class="panel flex items-center justify-between p-4">
		<div>
			<h1 class="text-base font-semibold">Negocio</h1>
			<p class="text-xs text-slate-500 dark:text-slate-400">
				Configuración visible en el sistema: logo, nombre de empresa, sucursal y teléfono.
			</p>
		</div>
	</div>

	<div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
		<section class="panel p-6">
			<div class="space-y-3">
				<label class="block space-y-1">
					<span class="text-sm font-medium">Nombre de empresa</span>
					<input class="input" bind:value={companyName} placeholder="Ej: Grido Delivery" />
				</label>

				<label class="block space-y-1">
					<span class="text-sm font-medium">Nombre de sucursal</span>
					<input class="input" bind:value={branchName} placeholder="Ej: Ituzaingó Centro" />
				</label>

				<label class="block space-y-1">
					<span class="text-sm font-medium">Teléfono del negocio</span>
					<div class="flex gap-2">
						<div class="relative w-28 shrink-0">
							<button
								type="button"
								class="input flex w-full items-center justify-between !pl-2 !pr-2"
								onclick={() => (phoneCountryOpen = !phoneCountryOpen)}
							>
								<span class="truncate">{selectedPhoneCountry.flag} {selectedPhoneCountry.dialCode}</span>
								<svg viewBox="0 0 20 20" class="h-4 w-4 text-slate-500 dark:text-slate-400" fill="none">
									<path d="M5 7.5l5 5 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
								</svg>
							</button>
							{#if phoneCountryOpen}
								<div class="absolute left-0 top-[calc(100%+0.35rem)] z-30 w-72 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-black">
									<input
										class="input !mb-2 !py-1.5 text-xs"
										bind:value={phoneCountryQuery}
										placeholder="Buscar país..."
									/>
									<div class="max-h-56 overflow-auto">
										{#each filteredPhoneCountries as country}
											<button
												type="button"
												class="block w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-900"
												onclick={() => {
													phoneCountryIso = country.iso;
													phoneCountryOpen = false;
													phoneCountryQuery = '';
												}}
											>
												{country.flag} {country.name} ({country.dialCode})
											</button>
										{/each}
									</div>
								</div>
							{/if}
						</div>
						<input
							class="input flex-1"
							type="tel"
							bind:value={phoneNumber}
							placeholder="Número de teléfono"
						/>
					</div>
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
							{#if phoneNumber.trim()}
								<p class="text-xs text-slate-500 dark:text-slate-400">{joinPhone(phoneCountryIso, phoneNumber)}</p>
							{/if}
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

		<section class="panel overflow-hidden p-0">
			<div class="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
				<h2 class="text-base font-semibold">Direcciones</h2>
				<p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
					Dirección principal y otras de interés del negocio.
				</p>
			</div>
			<div class="space-y-4 p-4">
				{#if addresses.length === 0}
					<div class="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
						Aún no cargaste direcciones. Agregá la principal y otras si necesitás.
					</div>
				{:else}
					<div class="space-y-3">
						{#each addresses as addr}
							<div class="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
								<div class="flex items-start justify-between gap-3">
									<div>
										<div class="flex items-center gap-2">
											<p class="text-base font-semibold text-slate-900 dark:text-slate-100">{addr.label}</p>
											{#if addr.isPrimary}
												<span class="rounded bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200">Principal</span>
											{/if}
										</div>
										<p class="text-sm text-slate-600 dark:text-slate-300">{addr.addressLine}</p>
										<p class="text-sm text-slate-500 dark:text-slate-400">
											{[addr.city, addr.state, addr.postalCode, addr.country].filter(Boolean).join(', ')}
										</p>
									</div>
									<div class="flex shrink-0 gap-1">
										{#if !addr.isPrimary}
											<button
												class="btn-secondary !px-2 !py-1 text-xs"
												type="button"
												onclick={() => setPrimaryAddress(addr.id)}
											>
												Principal
											</button>
										{/if}
										<button
											class="btn-secondary !px-2 !py-1 text-xs text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
											type="button"
											onclick={() => removeAddress(addr.id)}
										>
											Eliminar
										</button>
									</div>
								</div>
							</div>
						{/each}
					</div>
				{/if}

				<div class="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
					<p class="mb-2 text-xs font-medium text-slate-600 dark:text-slate-300">Agregar dirección</p>
					<div class="space-y-3">
						<input class="input" bind:value={newAddress.label} placeholder="Etiqueta (ej. Principal, Sucursal)" />
						<input class="input" bind:value={newAddress.addressLine} placeholder="Dirección completa" />
						<div class="grid grid-cols-1 gap-2 md:grid-cols-2">
							<input class="input" bind:value={newAddress.city} placeholder="Ciudad" />
							<select class="input" bind:value={newAddressCountryIso}>
								{#each addressCountryOptions as country}
									<option value={country.iso}>{country.name}</option>
								{/each}
							</select>
						</div>
						<div class="grid grid-cols-1 gap-2 md:grid-cols-2">
							<input class="input" bind:value={newAddress.postalCode} placeholder="Código postal" />
							<select class="input" bind:value={newAddressStateIso} disabled={addressStateOptions.length === 0}>
								{#if addressStateOptions.length === 0}
									<option value="">Sin estados/provincias</option>
								{:else}
									{#each addressStateOptions as state}
										<option value={state.iso}>{state.name}</option>
									{/each}
								{/if}
							</select>
						</div>
						<div class="flex justify-end">
							<button class="btn-primary" type="button" disabled={isSavingAddress} onclick={addAddress}>
								{#if isSavingAddress}Guardando...{:else}Agregar dirección{/if}
							</button>
						</div>
					</div>
				</div>
			</div>
		</section>
	</div>
</div>
