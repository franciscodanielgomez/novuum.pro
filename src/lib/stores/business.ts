import { supabase } from '$lib/supabase/client';
import { get, writable } from 'svelte/store';

type BusinessSettings = {
	companyName: string;
	branchName: string;
	logoUrl: string | null;
};

type BusinessState = {
	id: string | null;
	companyName: string;
	branchName: string;
	logoUrl: string | null;
	loading: boolean;
};

const DEFAULT_SETTINGS: BusinessSettings = {
	companyName: 'Grido',
	branchName: 'Ituzaingó',
	logoUrl: null
};

const state = writable<BusinessState>({
	id: null,
	companyName: DEFAULT_SETTINGS.companyName,
	branchName: DEFAULT_SETTINGS.branchName,
	logoUrl: DEFAULT_SETTINGS.logoUrl,
	loading: false
});

const FALLBACK_KEY = 'grido_v0_business_settings';
const LOGO_BUCKET = 'novum-grido';
const MAX_LOGO_SIZE_BYTES = 50 * 1024 * 1024;

const readFallback = (): BusinessSettings => {
	if (typeof localStorage === 'undefined') return DEFAULT_SETTINGS;
	const raw = localStorage.getItem(FALLBACK_KEY);
	if (!raw) return DEFAULT_SETTINGS;
	try {
		const parsed = JSON.parse(raw) as Partial<BusinessSettings>;
		return {
			companyName: parsed.companyName?.trim() || DEFAULT_SETTINGS.companyName,
			branchName: parsed.branchName?.trim() || DEFAULT_SETTINGS.branchName,
			logoUrl: parsed.logoUrl?.trim() || null
		};
	} catch {
		return DEFAULT_SETTINGS;
	}
};

const writeFallback = (settings: BusinessSettings) => {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(FALLBACK_KEY, JSON.stringify(settings));
};

export const businessStore = {
	subscribe: state.subscribe,
	load: async () => {
		state.update((s) => ({ ...s, loading: true }));
		try {
			const { data, error } = await supabase
				.from('business_settings')
				.select('id, company_name, branch_name, logo_url')
				.order('created_at', { ascending: true })
				.limit(1)
				.maybeSingle();

			if (!error && data) {
				const next: BusinessSettings = {
					companyName: data.company_name?.trim() || DEFAULT_SETTINGS.companyName,
					branchName: data.branch_name?.trim() || DEFAULT_SETTINGS.branchName,
					logoUrl: data.logo_url?.trim() || null
				};
				writeFallback(next);
				state.set({ id: data.id, ...next, loading: false });
				return;
			}
		} catch {
			// Sin conexión o error: usar fallback de localStorage o valores por defecto
		}
		state.set({ id: null, ...readFallback(), loading: false });
	},
	updateSettings: async (settings: BusinessSettings) => {
		const companyName = settings.companyName.trim();
		const branchName = settings.branchName.trim();
		const logoUrl = settings.logoUrl?.trim() || null;
		if (!companyName || !branchName) return false;
		const current = get(state);
		const payload = {
			company_name: companyName,
			branch_name: branchName,
			logo_url: logoUrl
		};

		if (current.id) {
			const { error } = await supabase.from('business_settings').update(payload).eq('id', current.id);
			if (!error) {
				const next = { companyName, branchName, logoUrl };
				writeFallback(next);
				state.update((s) => ({ ...s, ...next }));
				return true;
			}
		}

		const { data, error } = await supabase
			.from('business_settings')
			.insert(payload)
			.select('id, company_name, branch_name, logo_url')
			.single();

		if (!error && data) {
			const next: BusinessSettings = {
				companyName: data.company_name?.trim() || companyName,
				branchName: data.branch_name?.trim() || branchName,
				logoUrl: data.logo_url?.trim() || logoUrl
			};
			writeFallback(next);
			state.set({ id: data.id, ...next, loading: false });
			return true;
		}

		const fallbackNext = { companyName, branchName, logoUrl };
		writeFallback(fallbackNext);
		state.update((s) => ({ ...s, ...fallbackNext }));
		return true;
	},
	uploadLogo: async (file: File) => {
		if (!file) return { ok: false as const, message: 'Archivo inválido' };
		if (file.size > MAX_LOGO_SIZE_BYTES) {
			return { ok: false as const, message: 'El logo supera el límite de 50MB' };
		}
		if (!file.type.startsWith('image/')) {
			return { ok: false as const, message: 'Solo se permiten imágenes' };
		}

		const {
			data: { user }
		} = await supabase.auth.getUser();
		if (!user?.id) {
			return { ok: false as const, message: 'Necesitás iniciar sesión para subir el logo' };
		}

		const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
		const fileName = `business-logo-${Date.now()}-${crypto.randomUUID()}.${ext}`;
		const path = `${user.id}/business/${fileName}`;
		const { error } = await supabase.storage.from(LOGO_BUCKET).upload(path, file, {
			cacheControl: '3600',
			upsert: true
		});
		if (error) {
			const message =
				error.message?.includes('row-level security')
					? 'No tenés permisos de storage para subir el logo (RLS). Ejecutá el SQL de upgrade del bucket/policies.'
					: error.message || 'No se pudo subir el logo';
			return { ok: false as const, message };
		}

		const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path);
		if (!data?.publicUrl) {
			return { ok: false as const, message: 'No se pudo obtener la URL pública del logo' };
		}

		return { ok: true as const, url: data.publicUrl };
	},
	updateBranchName: async (name: string) => {
		const current = get(state);
		return businessStore.updateSettings({
			companyName: current.companyName,
			branchName: name,
			logoUrl: current.logoUrl
		});
	}
};
