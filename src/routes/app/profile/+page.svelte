<script lang="ts">
	import { Country, State } from 'country-state-city';
	import { getCountries, getCountryCallingCode } from 'libphonenumber-js/min';
	import { supabase } from '$lib/supabase/client';
	import { removeStorageFileIfOurs } from '$lib/supabase/storage-helpers';
	import { sessionStore } from '$lib/stores/session';
	import { toastsStore } from '$lib/stores/toasts';
	import { onDestroy, onMount } from 'svelte';

	const MAX_AVATAR_SIZE_BYTES = 50 * 1024 * 1024;
	const AVATAR_BUCKET = 'novum-grido';

	let firstName = '';
	let lastName = '';
	let phone = '';
	let phoneCountry = 'AR';
	let referencePhone = '';
	let referencePhoneCountry = 'AR';
	let email = '';
	let avatarUrl = '';
	let avatarPreviewUrl = '';
	let selectedAvatarFile: File | null = null;
	let isSaving = false;
	let phoneCountryOpen = false;
	let referenceCountryOpen = false;
	let phoneCountryQuery = '';
	let referenceCountryQuery = '';
	let addresses: Array<{
		id: string;
		label: string;
		addressLine: string;
		city: string;
		state: string;
		postalCode: string;
		country: string;
	}> = [];
	let newAddress = {
		label: '',
		addressLine: '',
		city: '',
		postalCode: ''
	};
	let newAddressCountryIso = 'AR';
	let newAddressStateIso = '';
	let isSavingAddress = false;
	let profileTableReady = true;
	let addressesTableReady = true;
	let currentUserId = '';

	$: canEditProfile = Boolean($sessionStore.user);
	$: if (!currentUserId && $sessionStore.user?.id) {
		currentUserId = $sessionStore.user.id;
	}
	$: if (!email && $sessionStore.user?.email) {
		email = $sessionStore.user.email;
	}

	const buildDisplayInitials = () => {
		const first = firstName.trim();
		const last = lastName.trim();
		if (first && last) return `${first[0]}${last[0]}`.toUpperCase();
		if (first) return first.slice(0, 2).toUpperCase();
		return 'U';
	};

	const toErrorMessage = (error: unknown, fallback: string) => {
		if (error instanceof DOMException && error.name === 'AbortError') return fallback;
		if (error instanceof Error && /abort/i.test(error.message)) return fallback;
		if (error instanceof Error && error.message) return error.message;
		if (typeof error === 'string' && /abort/i.test(error)) return fallback;
		if (typeof error === 'string' && error) return error;
		return fallback;
	};

	const sanitizeMessage = (message: string | undefined, fallback: string) => {
		if (!message) return fallback;
		return /abort|aborted|signal/i.test(message) ? fallback : message;
	};

	const describeSupabaseError = (error: unknown, fallback: string) => {
		if (!error || typeof error !== 'object') return fallback;
		const candidate = error as {
			message?: string;
			details?: string;
			hint?: string;
			code?: string;
		};
		const parts = [candidate.message, candidate.details, candidate.hint].filter(
			(part): part is string => Boolean(part && part.trim())
		);
		if (parts.length > 0) return parts.join(' | ');
		if (candidate.code) return `${fallback} (code: ${candidate.code})`;
		return fallback;
	};

	const isMissingTableError = (message: string | undefined, tableName: string) => {
		if (!message) return false;
		const normalized = message.toLowerCase();
		return (
			normalized.includes(`public.${tableName}`.toLowerCase()) &&
			normalized.includes('schema cache') &&
			normalized.includes('could not find')
		);
	};

	const toFlag = (iso: string) =>
		iso
			.toUpperCase()
			.replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));

	const regionNames =
		typeof Intl !== 'undefined' && 'DisplayNames' in Intl
			? new Intl.DisplayNames(['es'], { type: 'region' })
			: null;

	const phoneCountryOptions = getCountries()
		.map((iso) => {
			const dialCode = `+${getCountryCallingCode(iso)}`;
			const countryName = regionNames?.of(iso) ?? iso;
			return {
				iso,
				dialCode,
				name: countryName,
				flag: toFlag(iso)
			};
		})
		.sort((a, b) => a.name.localeCompare(b.name, 'es'));

	const defaultCountry = 'AR';

	const getDialCodeByCountry = (iso: string) =>
		phoneCountryOptions.find((option) => option.iso === iso)?.dialCode ?? '+54';

	const filterCountries = (query: string) => {
		const term = query.trim().toLowerCase();
		if (!term) return phoneCountryOptions;
		return phoneCountryOptions.filter(
			(country) =>
				country.name.toLowerCase().includes(term) ||
				country.dialCode.toLowerCase().includes(term) ||
				country.iso.toLowerCase().includes(term)
		);
	};

	const addressCountryOptions = Country.getAllCountries()
		.map((country) => ({
			iso: country.isoCode,
			name: country.name,
			flag: toFlag(country.isoCode)
		}))
		.sort((a, b) => a.name.localeCompare(b.name, 'es'));

	$: selectedAddressCountry =
		addressCountryOptions.find((country) => country.iso === newAddressCountryIso) ??
		addressCountryOptions[0];

	$: addressStateOptions = State.getStatesOfCountry(newAddressCountryIso)
		.map((state) => ({
			iso: state.isoCode,
			name: state.name
		}))
		.sort((a, b) => a.name.localeCompare(b.name, 'es'));

	$: if (addressStateOptions.length === 0) {
		newAddressStateIso = '';
	} else if (!addressStateOptions.some((state) => state.iso === newAddressStateIso)) {
		newAddressStateIso = addressStateOptions[0]?.iso ?? '';
	}

	$: selectedPhoneCountry =
		phoneCountryOptions.find((country) => country.iso === phoneCountry) ?? phoneCountryOptions[0];
	$: selectedReferenceCountry =
		phoneCountryOptions.find((country) => country.iso === referencePhoneCountry) ??
		phoneCountryOptions[0];
	$: filteredPhoneCountries = filterCountries(phoneCountryQuery);
	$: filteredReferenceCountries = filterCountries(referenceCountryQuery);

	const selectPhoneCountry = (iso: string) => {
		phoneCountry = iso;
		phoneCountryOpen = false;
		phoneCountryQuery = '';
	};

	const selectReferenceCountry = (iso: string) => {
		referencePhoneCountry = iso;
		referenceCountryOpen = false;
		referenceCountryQuery = '';
	};

	const splitPhone = (raw: string | null | undefined) => {
		const value = (raw ?? '').trim();
		if (!value) return { country: defaultCountry, number: '' };
		const match = value.match(/^(\+\d{1,4})\s*(.*)$/);
		if (!match) return { country: defaultCountry, number: value };
		const dialCode = match[1];
		const country =
			phoneCountryOptions.find((option) => option.dialCode === dialCode)?.iso ?? defaultCountry;
		return {
			country,
			number: (match[2] ?? '').trim()
		};
	};

	const joinPhone = (countryIso: string, number: string) => {
		const safeNumber = number.trim();
		if (!safeNumber) return null;
		const safeDialCode = getDialCodeByCountry(countryIso);
		return `${safeDialCode} ${safeNumber}`;
	};

	const onAvatarSelected = (event: Event) => {
		const target = event.currentTarget as HTMLInputElement;
		selectedAvatarFile = target.files?.[0] ?? null;
		if (avatarPreviewUrl) {
			URL.revokeObjectURL(avatarPreviewUrl);
			avatarPreviewUrl = '';
		}
		if (selectedAvatarFile) {
			avatarPreviewUrl = URL.createObjectURL(selectedAvatarFile);
		}
	};

	// Mismo patrón que negocio: subida directa; se borra la foto anterior si era de nuestro bucket.
	const uploadAvatar = async (file: File, userId: string, currentAvatarUrl?: string | null) => {
		if (file.size > MAX_AVATAR_SIZE_BYTES) {
			return { ok: false as const, message: 'La foto supera el límite de 50MB' };
		}
		if (!file.type.startsWith('image/')) {
			return { ok: false as const, message: 'Solo se permiten imágenes' };
		}
		const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
		const fileName = `avatar-${Date.now()}-${crypto.randomUUID()}.${ext}`;
		const path = `${userId}/profile/${fileName}`;
		const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, file, {
			cacheControl: '3600',
			upsert: false,
			contentType: file.type || 'image/png'
		});
		if (error) {
			const message =
				error.message?.includes('row-level security')
					? 'No tenés permisos para subir la foto (RLS). Revisá políticas del bucket.'
					: error.message || 'No se pudo subir la foto';
			return { ok: false as const, message };
		}
		const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
		if (!data?.publicUrl) {
			return { ok: false as const, message: 'No se pudo obtener la URL de la foto' };
		}
		if (currentAvatarUrl?.trim()) {
			await removeStorageFileIfOurs(AVATAR_BUCKET, currentAvatarUrl.trim());
		}
		return { ok: true as const, url: data.publicUrl };
	};

	const loadAddresses = async (userId: string) => {
		if (!addressesTableReady) {
			addresses = [];
			return;
		}
		const { data, error } = await supabase
			.from('user_addresses')
			.select('id, label, address_line, city, state, postal_code, country')
			.eq('user_id', userId)
			.order('created_at', { ascending: true });
		if (error) {
			if (isMissingTableError(error.message, 'user_addresses')) {
				addressesTableReady = false;
				addresses = [];
				toastsStore.error('Falta migración de base de datos: tabla user_addresses');
				return;
			}
			toastsStore.error(sanitizeMessage(error.message, 'No se pudieron cargar las direcciones'));
			return;
		}
		addressesTableReady = true;
		addresses =
			data?.map((item) => ({
				id: item.id,
				label: item.label ?? '',
				addressLine: item.address_line ?? '',
				city: item.city ?? '',
				state: item.state ?? '',
				postalCode: item.postal_code ?? '',
				country: item.country ?? ''
			})) ?? [];
	};

	const addAddress = async () => {
		if (isSavingAddress) return;
		if (!newAddress.label.trim() || !newAddress.addressLine.trim()) {
			toastsStore.error('Completá al menos etiqueta y dirección');
			return;
		}
		if (!addressesTableReady) {
			toastsStore.error('No se puede guardar dirección hasta crear la tabla user_addresses');
			return;
		}
		const userId = currentUserId || $sessionStore.user?.id || '';
		if (!userId) {
			toastsStore.error('Necesitás iniciar sesión para agregar direcciones');
			return;
		}
		isSavingAddress = true;
		try {
			const payload = {
				user_id: userId,
				label: newAddress.label.trim(),
				address_line: newAddress.addressLine.trim(),
				city: newAddress.city.trim() || null,
				state: addressStateOptions.find((state) => state.iso === newAddressStateIso)?.name ?? null,
				postal_code: newAddress.postalCode.trim() || null,
				country: selectedAddressCountry?.name ?? null
			};
			const { error } = await supabase.from('user_addresses').insert(payload);
			if (error) {
				if (isMissingTableError(error.message, 'user_addresses')) {
					addressesTableReady = false;
					toastsStore.error('No se puede guardar dirección hasta crear la tabla user_addresses');
					return;
				}
				toastsStore.error(sanitizeMessage(error.message, 'No se pudo guardar la dirección'));
				return;
			}
			newAddress = {
				label: '',
				addressLine: '',
				city: '',
				postalCode: ''
			};
			newAddressCountryIso = 'AR';
			newAddressStateIso = '';
			await loadAddresses(userId);
			toastsStore.success('Dirección agregada');
		} catch {
			toastsStore.error('Ocurrió un error inesperado guardando la dirección');
		} finally {
			isSavingAddress = false;
		}
	};

	const removeAddress = async (id: string) => {
		if (!addressesTableReady) {
			toastsStore.error('No se puede eliminar dirección hasta crear la tabla user_addresses');
			return;
		}
		const { error } = await supabase.from('user_addresses').delete().eq('id', id);
		if (error) {
			if (isMissingTableError(error.message, 'user_addresses')) {
				addressesTableReady = false;
				toastsStore.error('Falta migración de base de datos: tabla user_addresses');
				return;
			}
				toastsStore.error(sanitizeMessage(error.message, 'No se pudo eliminar la dirección'));
			return;
		}
		addresses = addresses.filter((addr) => addr.id !== id);
		toastsStore.success('Dirección eliminada');
	};

	const save = async () => {
		if (isSaving) return;
		if (!canEditProfile) {
			toastsStore.error('Necesitás iniciar sesión para editar tu perfil');
			return;
		}
		isSaving = true;
		let successToastShown = false;
		try {
			const userId = currentUserId || $sessionStore.user?.id || '';
			if (!userId) {
				toastsStore.error('Sesión no válida');
				return;
			}

			let nextAvatarUrl = avatarUrl.trim() || null;
			if (selectedAvatarFile) {
				try {
					const uploaded = await uploadAvatar(selectedAvatarFile, userId, avatarUrl.trim() || null);
					if (!uploaded.ok) {
						toastsStore.error(uploaded.message ?? 'No se pudo subir la foto de perfil');
						return;
					} else {
						nextAvatarUrl = uploaded.url ?? nextAvatarUrl;
					}
				} catch (error) {
					toastsStore.error(toErrorMessage(error, 'No se pudo subir la foto de perfil'));
					return;
				}
			}

			const authPayload = {
				name: `${firstName.trim()} ${lastName.trim()}`.trim() || email,
				avatar_url: nextAvatarUrl
			};
			const shouldSyncAuth =
				authPayload.name !== ($sessionStore.user?.name ?? '') ||
				(authPayload.avatar_url ?? '') !== ($sessionStore.user?.avatarUrl ?? '');
			if (shouldSyncAuth) {
				void supabase.auth
					.updateUser({
					data: authPayload
					})
					.catch(() => {
						// Avoid blocking profile save on metadata sync failure.
					});
			}
			sessionStore.updateUserProfile({
				name: authPayload.name,
				avatarUrl: nextAvatarUrl
			});

			const profilePayload = {
				id: userId,
				first_name: firstName.trim() || null,
				last_name: lastName.trim() || null,
				phone: joinPhone(phoneCountry, phone),
				reference_phone: joinPhone(referencePhoneCountry, referencePhone),
				avatar_url: nextAvatarUrl
			};

			if (profileTableReady) {
				try {
					// More resilient than upsert when environments differ in constraints/policies.
					const updateResult = (await supabase
						.from('user_profiles')
						.update({
							first_name: profilePayload.first_name,
							last_name: profilePayload.last_name,
							phone: profilePayload.phone,
							reference_phone: profilePayload.reference_phone,
							avatar_url: profilePayload.avatar_url
						})
						.eq('id', userId)
						.select('id')) as { data: Array<{ id: string }> | null; error: { message?: string } | null };

					if (updateResult.error) {
						if (isMissingTableError(updateResult.error.message, 'user_profiles')) {
							profileTableReady = false;
							toastsStore.error('No se puede guardar perfil hasta crear la tabla user_profiles');
							return;
						}
						toastsStore.error(describeSupabaseError(updateResult.error, 'No se pudo guardar tu perfil'));
						return;
					}

					if (!updateResult.data || updateResult.data.length === 0) {
						const insertResult = (await supabase.from('user_profiles').insert(profilePayload)) as {
							error: { message?: string } | null;
						};
						if (insertResult.error) {
							if (isMissingTableError(insertResult.error.message, 'user_profiles')) {
								profileTableReady = false;
								toastsStore.error('No se puede guardar perfil hasta crear la tabla user_profiles');
								return;
							}
							toastsStore.error(describeSupabaseError(insertResult.error, 'No se pudo guardar tu perfil'));
							return;
						}
					}
				} catch (error) {
					toastsStore.error(describeSupabaseError(error, 'No se pudo guardar tu perfil por un problema de red'));
					return;
				}
			}

			selectedAvatarFile = null;
			if (avatarPreviewUrl) {
				URL.revokeObjectURL(avatarPreviewUrl);
				avatarPreviewUrl = '';
			}
			avatarUrl = nextAvatarUrl ?? '';
			void sessionStore.hydrate();
			toastsStore.success('Perfil actualizado');
			successToastShown = true;
		} catch (error) {
			const isAbortOrTimeout =
				error instanceof DOMException && error.name === 'AbortError';
			const msg = (error instanceof Error && error.message) || '';
			const looksAbort = /abort|timeout|cancelled/i.test(msg);
			if (isAbortOrTimeout || looksAbort) {
				void sessionStore.hydrate();
				toastsStore.info(
					'La subida puede haber funcionado. Si no ves la foto, actualizá la página (F5).'
				);
			} else {
				toastsStore.error(toErrorMessage(error, 'Ocurrió un error inesperado guardando el perfil'));
			}
		} finally {
			isSaving = false;
		}
	};

	onDestroy(() => {
		if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
	});

	onMount(async () => {
		const {
			data: { user }
		} = await supabase.auth.getUser();
		if (!user?.id) return;
		currentUserId = user.id;
		profileTableReady = true;
		addressesTableReady = true;

		email = user.email ?? '';
		const metaName = ((user.user_metadata?.name as string | undefined) ?? '').trim();
		if (metaName) {
			const parts = metaName.split(/\s+/);
			firstName = parts[0] ?? '';
			lastName = parts.slice(1).join(' ');
		}
		avatarUrl = ((user.user_metadata?.avatar_url as string | undefined) ?? '').trim();

		if (profileTableReady) {
			const { data, error: profileLoadError } = await supabase
				.from('user_profiles')
				.select('first_name, last_name, phone, reference_phone, avatar_url')
				.eq('id', user.id)
				.maybeSingle();
			if (profileLoadError && isMissingTableError(profileLoadError.message, 'user_profiles')) {
				profileTableReady = false;
				toastsStore.error('Falta migración de base de datos: tabla user_profiles');
			}

			if (data) {
				firstName = data.first_name ?? firstName;
				lastName = data.last_name ?? lastName;
				const parsedPhone = splitPhone(data.phone);
				phoneCountry = parsedPhone.country;
				phone = parsedPhone.number;
				const parsedRefPhone = splitPhone(data.reference_phone);
				referencePhoneCountry = parsedRefPhone.country;
				referencePhone = parsedRefPhone.number;
				avatarUrl = data.avatar_url ?? avatarUrl;
			}
		}
		await loadAddresses(user.id);
	});
</script>

<section class="space-y-4">
	<div class="panel flex items-center justify-between p-4">
		<div>
			<h1 class="text-base font-semibold">Mi perfil</h1>
			<p class="text-xs text-slate-500 dark:text-slate-400">
				Actualizá tus datos personales, teléfonos y foto de perfil.
			</p>
		</div>
	</div>

	<div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
		<section class="panel p-6">
			<div class="space-y-3">
				<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
					<label class="block space-y-1">
						<span class="text-sm font-medium">Nombre</span>
						<input class="input" bind:value={firstName} placeholder="Ej: Francisco" />
					</label>
					<label class="block space-y-1">
						<span class="text-sm font-medium">Apellido</span>
						<input class="input" bind:value={lastName} placeholder="Ej: Gomez" />
					</label>
				</div>

				<label class="block space-y-1">
					<span class="text-sm font-medium">Email</span>
					<input class="input" type="email" bind:value={email} readonly disabled />
					<p class="text-xs text-slate-500 dark:text-slate-400">
						El email no se puede modificar por ahora porque corresponde al registro.
					</p>
				</label>

				<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
					<label class="block space-y-1">
						<span class="text-sm font-medium">Teléfono</span>
						<div class="flex gap-2">
							<div class="relative w-24 shrink-0">
								<button
									type="button"
									class="input flex items-center justify-between !pl-2 !pr-2"
									onclick={() => {
										phoneCountryOpen = !phoneCountryOpen;
										referenceCountryOpen = false;
									}}
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
													onclick={() => selectPhoneCountry(country.iso)}
												>
													{country.flag} {country.name} ({country.dialCode})
												</button>
											{/each}
										</div>
									</div>
								{/if}
							</div>
							<input class="input" bind:value={phone} placeholder="Phone number" />
						</div>
					</label>
					<label class="block space-y-1">
						<span class="text-sm font-medium">Teléfono de referencia</span>
						<div class="flex gap-2">
							<div class="relative w-24 shrink-0">
								<button
									type="button"
									class="input flex items-center justify-between !pl-2 !pr-2"
									onclick={() => {
										referenceCountryOpen = !referenceCountryOpen;
										phoneCountryOpen = false;
									}}
								>
									<span class="truncate">{selectedReferenceCountry.flag} {selectedReferenceCountry.dialCode}</span>
									<svg viewBox="0 0 20 20" class="h-4 w-4 text-slate-500 dark:text-slate-400" fill="none">
										<path d="M5 7.5l5 5 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
									</svg>
								</button>
								{#if referenceCountryOpen}
									<div class="absolute left-0 top-[calc(100%+0.35rem)] z-30 w-72 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-black">
										<input
											class="input !mb-2 !py-1.5 text-xs"
											bind:value={referenceCountryQuery}
											placeholder="Buscar país..."
										/>
										<div class="max-h-56 overflow-auto">
											{#each filteredReferenceCountries as country}
												<button
													type="button"
													class="block w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-900"
													onclick={() => selectReferenceCountry(country.iso)}
												>
													{country.flag} {country.name} ({country.dialCode})
												</button>
											{/each}
										</div>
									</div>
								{/if}
							</div>
							<input class="input" bind:value={referencePhone} placeholder="Phone number" />
						</div>
					</label>
				</div>

				<label class="block space-y-1">
					<span class="text-sm font-medium">Foto de perfil</span>
					<input class="input" type="file" accept="image/*" onchange={onAvatarSelected} />
					<p class="text-xs text-slate-500 dark:text-slate-400">
						Se sube al bucket <code>novum-grido</code>. Límite: 50MB.
					</p>
				</label>

				<div class="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
					<p class="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">Vista previa</p>
					<div class="flex items-center gap-3">
						{#if avatarPreviewUrl}
							<img src={avatarPreviewUrl} alt="Foto de perfil" class="h-12 w-12 rounded-full object-cover" />
						{:else if avatarUrl.trim()}
							<img src={avatarUrl.trim()} alt="Foto de perfil" class="h-12 w-12 rounded-full object-cover" />
						{:else}
							<div class="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white dark:bg-white dark:text-slate-900">
								{buildDisplayInitials()}
							</div>
						{/if}
						<div class="min-w-0">
							<p class="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
								{`${firstName} ${lastName}`.trim() || 'Tu nombre'}
							</p>
							<p class="truncate text-xs text-slate-500 dark:text-slate-400">{email || 'tu@email.com'}</p>
						</div>
					</div>
				</div>

				<div class="flex justify-between">
					<button class="btn-secondary !px-2 !py-1 text-xs" type="button" onclick={() => (avatarUrl = '')}>
						Quitar foto
					</button>
					<button class="btn-primary" disabled={!canEditProfile || isSaving} onclick={save}>
						{#if isSaving}Guardando...{:else}Guardar cambios{/if}
					</button>
				</div>
			</div>
		</section>

		<section class="panel overflow-hidden p-0">
			<div class="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
				<h2 class="text-base font-semibold">Direcciones</h2>
			</div>
			<div class="space-y-4 p-4">
				{#if addresses.length === 0}
					<div class="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
						Aún no cargaste direcciones.
					</div>
				{:else}
					<div class="space-y-3">
						{#each addresses as addr}
							<div class="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
								<div class="flex items-start justify-between gap-3">
									<div>
										<p class="text-base font-semibold text-slate-900 dark:text-slate-100">{addr.label}</p>
										<p class="text-sm text-slate-600 dark:text-slate-300">{addr.addressLine}</p>
										<p class="text-sm text-slate-500 dark:text-slate-400">
											{[addr.city, addr.state, addr.postalCode, addr.country].filter(Boolean).join(', ')}
										</p>
									</div>
									<button class="btn-secondary !px-2 !py-1 text-xs" type="button" onclick={() => removeAddress(addr.id)}>
										Eliminar
									</button>
								</div>
							</div>
						{/each}
					</div>
				{/if}

				<div class="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
					<div class="space-y-3">
						<input class="input" bind:value={newAddress.label} placeholder="Etiqueta (ej. Casa, Oficina)" />
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
								{#if isSavingAddress}Guardando...{:else}Guardar dirección{/if}
							</button>
						</div>
					</div>
				</div>
			</div>
		</section>
	</div>
</section>
