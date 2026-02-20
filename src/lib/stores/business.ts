import { supabase } from '$lib/supabase/client';
import { removeStorageFileIfOurs } from '$lib/supabase/storage-helpers';
import { get, writable } from 'svelte/store';

const DEFAULT_TICKET_FONT_PT = 30;
const DEFAULT_TICKET_MARGIN = 20;

type BusinessSettings = {
	companyName: string;
	branchName: string;
	logoUrl: string | null;
	shippingPrice: number;
	phone: string | null;
	ticketFontSizePt: number;
	ticketMarginLeft: number;
	ticketMarginRight: number;
};

type BusinessState = {
	id: string | null;
	companyName: string;
	branchName: string;
	logoUrl: string | null;
	shippingPrice: number;
	phone: string | null;
	ticketFontSizePt: number;
	ticketMarginLeft: number;
	ticketMarginRight: number;
	loading: boolean;
};

const DEFAULT_SETTINGS: BusinessSettings = {
	companyName: 'Grido',
	branchName: 'Ituzaingó',
	logoUrl: null,
	shippingPrice: 0,
	phone: null,
	ticketFontSizePt: DEFAULT_TICKET_FONT_PT,
	ticketMarginLeft: DEFAULT_TICKET_MARGIN,
	ticketMarginRight: DEFAULT_TICKET_MARGIN
};

const state = writable<BusinessState>({
	id: null,
	companyName: DEFAULT_SETTINGS.companyName,
	branchName: DEFAULT_SETTINGS.branchName,
	logoUrl: DEFAULT_SETTINGS.logoUrl,
	shippingPrice: DEFAULT_SETTINGS.shippingPrice,
	phone: DEFAULT_SETTINGS.phone,
	ticketFontSizePt: DEFAULT_SETTINGS.ticketFontSizePt,
	ticketMarginLeft: DEFAULT_SETTINGS.ticketMarginLeft,
	ticketMarginRight: DEFAULT_SETTINGS.ticketMarginRight,
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
		const num = (v: unknown, def: number) =>
			typeof v === 'number' && !Number.isNaN(v) ? v : def;
		return {
			companyName: parsed.companyName?.trim() || DEFAULT_SETTINGS.companyName,
			branchName: parsed.branchName?.trim() || DEFAULT_SETTINGS.branchName,
			logoUrl: parsed.logoUrl?.trim() || null,
			shippingPrice: num(parsed.shippingPrice, DEFAULT_SETTINGS.shippingPrice),
			phone: typeof parsed.phone === 'string' ? (parsed.phone.trim() || null) : DEFAULT_SETTINGS.phone,
			ticketFontSizePt: num(parsed.ticketFontSizePt, DEFAULT_TICKET_FONT_PT),
			ticketMarginLeft: num(parsed.ticketMarginLeft, DEFAULT_TICKET_MARGIN),
			ticketMarginRight: num(parsed.ticketMarginRight, DEFAULT_TICKET_MARGIN)
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
				.select('id, company_name, branch_name, logo_url, shipping_price, phone, ticket_font_size_pt, ticket_margin_left, ticket_margin_right')
				.order('created_at', { ascending: true })
				.limit(1)
				.maybeSingle();

			if (!error && data) {
				const num = (v: unknown, def: number) =>
					typeof v === 'number' && !Number.isNaN(v) ? v : def;
				const next: BusinessSettings = {
					companyName: data.company_name?.trim() || DEFAULT_SETTINGS.companyName,
					branchName: data.branch_name?.trim() || DEFAULT_SETTINGS.branchName,
					logoUrl: data.logo_url?.trim() || null,
					shippingPrice: num(data.shipping_price, DEFAULT_SETTINGS.shippingPrice),
					phone: data.phone?.trim() || null,
					ticketFontSizePt: num(data.ticket_font_size_pt, DEFAULT_TICKET_FONT_PT),
					ticketMarginLeft: num(data.ticket_margin_left, DEFAULT_TICKET_MARGIN),
					ticketMarginRight: num(data.ticket_margin_right, DEFAULT_TICKET_MARGIN)
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
		const shippingPrice = typeof settings.shippingPrice === 'number' ? settings.shippingPrice : 0;
		const phone = settings.phone?.trim() || null;
		const num = (v: unknown, def: number) => (typeof v === 'number' && !Number.isNaN(v) ? v : def);
		const ticketFontSizePt = num(settings.ticketFontSizePt, DEFAULT_TICKET_FONT_PT);
		const ticketMarginLeft = num(settings.ticketMarginLeft, DEFAULT_TICKET_MARGIN);
		const ticketMarginRight = num(settings.ticketMarginRight, DEFAULT_TICKET_MARGIN);
		if (!companyName || !branchName) return false;
		const current = get(state);
		const payload = {
			company_name: companyName,
			branch_name: branchName,
			logo_url: logoUrl,
			shipping_price: shippingPrice,
			phone,
			ticket_font_size_pt: ticketFontSizePt,
			ticket_margin_left: ticketMarginLeft,
			ticket_margin_right: ticketMarginRight
		};

		if (current.id) {
			const { error } = await supabase.from('business_settings').update(payload).eq('id', current.id);
			if (!error) {
				const next = {
					companyName,
					branchName,
					logoUrl,
					shippingPrice,
					phone,
					ticketFontSizePt,
					ticketMarginLeft,
					ticketMarginRight
				};
				writeFallback(next);
				state.update((s) => ({ ...s, ...next }));
				return true;
			}
		}

		const { data, error } = await supabase
			.from('business_settings')
			.insert(payload)
			.select('id, company_name, branch_name, logo_url, shipping_price, phone, ticket_font_size_pt, ticket_margin_left, ticket_margin_right')
			.single();

		if (!error && data) {
			const next: BusinessSettings = {
				companyName: data.company_name?.trim() || companyName,
				branchName: data.branch_name?.trim() || branchName,
				logoUrl: data.logo_url?.trim() || logoUrl,
				shippingPrice: num(data.shipping_price, shippingPrice),
				phone: data.phone?.trim() || null,
				ticketFontSizePt: num(data.ticket_font_size_pt, DEFAULT_TICKET_FONT_PT),
				ticketMarginLeft: num(data.ticket_margin_left, DEFAULT_TICKET_MARGIN),
				ticketMarginRight: num(data.ticket_margin_right, DEFAULT_TICKET_MARGIN)
			};
			writeFallback(next);
			state.set({ id: data.id, ...next, loading: false });
			return true;
		}

		const fallbackNext = {
			companyName,
			branchName,
			logoUrl,
			shippingPrice,
			phone,
			ticketFontSizePt,
			ticketMarginLeft,
			ticketMarginRight
		};
		writeFallback(fallbackNext);
		state.update((s) => ({ ...s, ...fallbackNext }));
		return true;
	},
	updateShippingPrice: async (value: number) => {
		const current = get(state);
		if (!current.id) return false;
		const num = Number(value);
		if (Number.isNaN(num) || num < 0) return false;
		const { error } = await supabase
			.from('business_settings')
			.update({ shipping_price: num })
			.eq('id', current.id);
		if (!error) {
			state.update((s) => ({ ...s, shippingPrice: num }));
			writeFallback({ ...readFallback(), shippingPrice: num });
			return true;
		}
		return false;
	},
	uploadLogo: async (file: File, currentLogoUrl?: string | null) => {
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
			upsert: false,
			contentType: file.type || 'image/png'
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

		if (currentLogoUrl?.trim()) {
			await removeStorageFileIfOurs(LOGO_BUCKET, currentLogoUrl.trim());
		}
		return { ok: true as const, url: data.publicUrl };
	},
	updateBranchName: async (name: string) => {
		const current = get(state);
		return businessStore.updateSettings({
			companyName: current.companyName,
			branchName: name,
			logoUrl: current.logoUrl,
			shippingPrice: current.shippingPrice,
			phone: current.phone,
			ticketFontSizePt: current.ticketFontSizePt,
			ticketMarginLeft: current.ticketMarginLeft,
			ticketMarginRight: current.ticketMarginRight
		});
	},
	/** Valores por defecto para impresión de ticket (usados si no hay config en DB). */
	DEFAULT_TICKET_FONT_PT,
	DEFAULT_TICKET_MARGIN
};
