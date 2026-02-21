import { api } from '$lib/api';
import { supabase } from '$lib/supabase/client';
import { removeStorageFileIfOurs } from '$lib/supabase/storage-helpers';
import { get, writable } from 'svelte/store';

const DEFAULT_TICKET_FONT_PT = 30;
/** Valores del software VB que imprime bien: Left=5, Right=40 */
const DEFAULT_TICKET_MARGIN_LEFT = 5;
const DEFAULT_TICKET_MARGIN_RIGHT = 40;

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
	ticketMarginLeft: DEFAULT_TICKET_MARGIN_LEFT,
	ticketMarginRight: DEFAULT_TICKET_MARGIN_RIGHT
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
			ticketMarginLeft: num(parsed.ticketMarginLeft, DEFAULT_TICKET_MARGIN_LEFT),
			ticketMarginRight: num(parsed.ticketMarginRight, DEFAULT_TICKET_MARGIN_RIGHT)
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
			const data = await api.businessSettings.getFirst();
			if (data) {
				const num = (v: unknown, def: number) =>
					typeof v === 'number' && !Number.isNaN(v) ? v : def;
				const next: BusinessSettings = {
					companyName: data.company_name?.trim() || DEFAULT_SETTINGS.companyName,
					branchName: data.branch_name?.trim() || DEFAULT_SETTINGS.branchName,
					logoUrl: data.logo_url?.trim() || null,
					shippingPrice: num(data.shipping_price, DEFAULT_SETTINGS.shippingPrice),
					phone: data.phone?.trim() || null,
					ticketFontSizePt: num(data.ticket_font_size_pt, DEFAULT_TICKET_FONT_PT),
					ticketMarginLeft: num(data.ticket_margin_left, DEFAULT_TICKET_MARGIN_LEFT),
					ticketMarginRight: num(data.ticket_margin_right, DEFAULT_TICKET_MARGIN_RIGHT)
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
		const ticketMarginLeft = num(settings.ticketMarginLeft, DEFAULT_TICKET_MARGIN_LEFT);
		const ticketMarginRight = num(settings.ticketMarginRight, DEFAULT_TICKET_MARGIN_RIGHT);
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
			try {
				await api.businessSettings.updateById(current.id, payload);
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
			} catch {
				// fallback a insert abajo
			}
		}

		try {
			const data = await api.businessSettings.insert(payload);
			const next: BusinessSettings = {
				companyName: data.company_name?.trim() || companyName,
				branchName: data.branch_name?.trim() || branchName,
				logoUrl: data.logo_url?.trim() || logoUrl,
				shippingPrice: num(data.shipping_price, shippingPrice),
				phone: data.phone?.trim() || null,
				ticketFontSizePt: num(data.ticket_font_size_pt, DEFAULT_TICKET_FONT_PT),
				ticketMarginLeft: num(data.ticket_margin_left, DEFAULT_TICKET_MARGIN_LEFT),
				ticketMarginRight: num(data.ticket_margin_right, DEFAULT_TICKET_MARGIN_RIGHT)
			};
			writeFallback(next);
			state.set({ id: data.id, ...next, loading: false });
			return true;
		} catch {
			// fallback local
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
		try {
			await api.businessSettings.updateById(current.id, { shipping_price: num });
			state.update((s) => ({ ...s, shippingPrice: num }));
			writeFallback({ ...readFallback(), shippingPrice: num });
			return true;
		} catch {
			return false;
		}
	},

	/**
	 * Actualiza solo la configuración de impresión del ticket.
	 * Útil para guardar desde Configuración sin depender de company/branch.
	 * @returns { ok: true } o { ok: false, error: string }
	 */
	updateTicketPrintSettings: async (
		ticketFontSizePt: number,
		ticketMarginLeft: number,
		ticketMarginRight: number
	): Promise<{ ok: true } | { ok: false; error: string }> => {
		const current = get(state);
		if (!current.id) {
			return { ok: false, error: 'No hay configuración del negocio cargada. Entrá a Datos del negocio y guardá nombre y sucursal primero.' };
		}
		const payload = {
			ticket_font_size_pt: ticketFontSizePt,
			ticket_margin_left: ticketMarginLeft,
			ticket_margin_right: ticketMarginRight
		};
		try {
			await api.businessSettings.updateById(current.id, payload);
		} catch (e) {
			return {
				ok: false,
				error: e instanceof Error ? e.message || 'Error al guardar en la base de datos' : 'Error al guardar en la base de datos'
			};
		}
		state.update((s) => ({
			...s,
			ticketFontSizePt,
			ticketMarginLeft,
			ticketMarginRight
		}));
		writeFallback({
			...readFallback(),
			ticketFontSizePt,
			ticketMarginLeft,
			ticketMarginRight
		});
		return { ok: true };
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
	/** Valores por defecto para impresión de ticket (como el software VB que imprime bien). */
	DEFAULT_TICKET_FONT_PT,
	DEFAULT_TICKET_MARGIN_LEFT,
	DEFAULT_TICKET_MARGIN_RIGHT
};
