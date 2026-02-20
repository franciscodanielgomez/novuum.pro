import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { api } from '$lib/api';
import { supabase } from '$lib/supabase/client';
import type { AppUser, SessionData, Shift } from '$lib/types';
import { derived, writable } from 'svelte/store';
import type { User } from '@supabase/supabase-js';

const SESSION_KEY = 'grido_v0_session';
/** Marca que el usuario cerró sesión (sessionStorage no persiste al refrescar en algunos entornos) */
const LOGOUT_FLAG_KEY = 'novum_logout';
/** Timestamp de cierre de sesión en localStorage; persiste al refrescar para no restaurar sesión */
const LOGOUT_TS_KEY = 'novum_logout_ts';
const LOGOUT_TS_VALID_MS = 60_000;

/** Borrar sesión de Supabase en localStorage para que getSession() devuelva null tras logout */
const clearSupabaseAuthStorage = () => {
	if (typeof localStorage === 'undefined') return;
	try {
		const keys: string[] = [];
		for (let i = 0; i < localStorage.length; i++) {
			const k = localStorage.key(i);
			if (k?.startsWith('sb-')) keys.push(k);
		}
		keys.forEach((k) => localStorage.removeItem(k));
	} catch {
		// ignore
	}
};

type SessionState = {
	user: AppUser | null;
	location: 'Ituzaingó';
	shift: Shift | null;
	ready: boolean;
};

const initial: SessionState = {
	user: null,
	location: 'Ituzaingó',
	shift: null,
	ready: false
};

const state = writable<SessionState>(initial);
let listenerInitialized = false;

const mapLegacyRole = (role: string | null | undefined): AppUser['role'] => {
	if (role === 'CAJA') return 'CAJERO';
	if (role === 'ADMIN') return 'ADMINISTRADOR';
	if (role === 'CADETE') return 'CADETE';
	if (role === 'GESTOR') return 'GESTOR';
	if (role === 'ADMINISTRADOR') return 'ADMINISTRADOR';
	return 'CAJERO';
};

/** Usuario mínimo desde auth, sin consultar team_members/user_profiles (para no bloquear el login). */
const minimalUserFromAuth = (user: User | null): AppUser | null => {
	if (!user?.id || !user.email) return null;
	const name = ((user.user_metadata?.name as string | undefined) ?? '').trim() || user.email;
	return {
		id: user.id,
		email: user.email,
		name,
		role: 'CAJERO',
		avatarUrl: undefined
	};
};

const mapUser = async (user: User | null): Promise<AppUser | null> => {
	if (!user?.id || !user.email) return null;
	let role: AppUser['role'] = 'CAJERO';
	let displayName = ((user.user_metadata?.name as string | undefined) ?? '').trim();
	let avatarUrl = ((user.user_metadata?.avatar_url as string | undefined) ?? '').trim();
	const { data } = await supabase.from('team_members').select('role, roles').eq('id', user.id).maybeSingle();
	if (data) {
		const rolesArr = Array.isArray((data as { roles?: string[] }).roles) && (data as { roles?: string[] }).roles!.length > 0
			? (data as { roles: string[] }).roles
			: [(data as { role?: string }).role].filter(Boolean) as string[];
		if (rolesArr.includes('ADMINISTRADOR')) role = 'ADMINISTRADOR';
		else if (rolesArr.length > 0) role = mapLegacyRole(rolesArr[0]);
		else if (data.role) role = mapLegacyRole(data.role);
	}
	const { data: profileData } = await supabase
		.from('user_profiles')
		.select('first_name, last_name, avatar_url')
		.eq('id', user.id)
		.maybeSingle();
	if (profileData) {
		const first = (profileData.first_name ?? '').trim();
		const last = (profileData.last_name ?? '').trim();
		const full = `${first} ${last}`.trim();
		if (full) displayName = full;
		if (profileData.avatar_url?.trim()) avatarUrl = profileData.avatar_url.trim();
	}
	return {
		id: user.id,
		email: user.email,
		name: displayName || user.email,
		role,
		avatarUrl: avatarUrl || undefined
	};
};

const saveSession = (session: SessionData | null) => {
	if (!browser) return;
	if (!session) {
		localStorage.removeItem(SESSION_KEY);
		return;
	}
	localStorage.setItem(SESSION_KEY, JSON.stringify(session));
};

export const sessionStore = {
	subscribe: state.subscribe,
	hydrate: async () => {
		if (!browser) return;
		// Si cerró sesión hace poco, no restaurar (sessionStorage se pierde al refrescar en Tauri/web)
		const logoutTs = typeof localStorage !== 'undefined' ? localStorage.getItem(LOGOUT_TS_KEY) : null;
		if (logoutTs) {
			const ts = parseInt(logoutTs, 10);
			if (!Number.isNaN(ts) && Date.now() - ts < LOGOUT_TS_VALID_MS) {
				localStorage.removeItem(LOGOUT_TS_KEY);
				if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(LOGOUT_FLAG_KEY);
				state.set({ ...initial, ready: true });
				return;
			}
			localStorage.removeItem(LOGOUT_TS_KEY);
		}
		if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(LOGOUT_FLAG_KEY) === '1') {
			sessionStorage.removeItem(LOGOUT_FLAG_KEY);
			state.set({ ...initial, ready: true });
			return;
		}
		const READY_TIMEOUT_MS = 8_000;
		const readyTimeoutId = setTimeout(() => {
			state.update((s) => (s.ready ? s : { ...s, ready: true }));
		}, READY_TIMEOUT_MS);
		try {
			const raw = localStorage.getItem(SESSION_KEY);
			let localLocation: SessionData['location'] = 'Ituzaingó';
			if (raw) {
				try {
					localLocation = (JSON.parse(raw) as SessionData).location ?? 'Ituzaingó';
				} catch {
					localLocation = 'Ituzaingó';
				}
			}
			try {
				await supabase.auth.refreshSession();
			} catch {
				// Offline o refresh fallido
			}
			let user: User | null = null;
			try {
				const { data } = await supabase.auth.getSession();
				user = data?.session?.user ?? null;
			} catch {
				// Supabase auth no disponible
			}
			// Mostrar app enseguida con usuario mínimo; si no, con ready:true y user:null redirige a login
			const minimal = minimalUserFromAuth(user);
			state.set({
				user: minimal,
				location: localLocation,
				shift: null,
				ready: true
			});
			if (!user) return;

			// Completar perfil y turno en segundo plano para no bloquear ni el layout ni la carga de datos
			void (async () => {
				let shift: Shift | null = null;
				try {
					shift = await api.shifts.getOpen();
				} catch {
					// Sin conexión con la API
				}
				let mappedUser: AppUser | null = minimal;
				try {
					mappedUser = await mapUser(user);
				} catch {
					if (user?.id && user?.email) {
						mappedUser = {
							id: user.id,
							email: user.email,
							name: ((user.user_metadata?.name as string)?.trim() || user.email) ?? 'Usuario',
							role: 'CAJERO'
						};
					}
				}
				state.set({
					user: mappedUser,
					location: localLocation,
					shift,
					ready: true
				});
			})();
		} finally {
			clearTimeout(readyTimeoutId);
		}

		if (listenerInitialized) return;
		listenerInitialized = true;
		supabase.auth.onAuthStateChange(async (event, session) => {
			if (event === 'SIGNED_OUT' || !session) {
				state.update((s) => ({ ...s, user: null, ready: true }));
				return;
			}
			try {
				const mapped = await mapUser(session.user);
				state.update((s) => ({
					...s,
					user: mapped,
					ready: true
				}));
			} catch {
				state.update((s) => ({
					...s,
					user: session.user ? {
						id: session.user.id,
						email: session.user.email ?? '',
						name: ((session.user.user_metadata?.name as string)?.trim() || session.user.email) ?? 'Usuario',
						role: 'CAJERO'
					} : null,
					ready: true
				}));
			}
		});
	},
	login: async (email: string, password: string) => {
		try {
			const { data, error } = await supabase.auth.signInWithPassword({ email, password });
			if (error || !data.user) {
				return { ok: false, message: error?.message ?? 'No se pudo iniciar sesión' };
			}
			if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(LOGOUT_FLAG_KEY);
			if (typeof localStorage !== 'undefined') localStorage.removeItem(LOGOUT_TS_KEY);
			saveSession({ location: 'Ituzaingó' });
			// No esperar getOpen ni mapUser: pueden colgar y dejan el login en "cargando". El layout hará hydrate() al cargar /app.
			const minimal = minimalUserFromAuth(data.user);
			state.set({
				user: minimal,
				location: 'Ituzaingó',
				shift: null,
				ready: true
			});
			return { ok: true as const };
		} catch {
			return { ok: false, message: 'Error inesperado al iniciar sesión' };
		}
	},
	register: async (email: string, password: string, name: string) => {
		const { data, error } = await supabase.auth.signUp({
			email,
			password,
			options: {
				data: { name }
			}
		});
		if (error) {
			return { ok: false, message: error.message };
		}
		if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(LOGOUT_FLAG_KEY);
		if (typeof localStorage !== 'undefined') localStorage.removeItem(LOGOUT_TS_KEY);
		saveSession({ location: 'Ituzaingó' });
		if (data.session?.user) {
			const minimal = minimalUserFromAuth(data.session.user);
			state.set({
				user: minimal,
				location: 'Ituzaingó',
				shift: null,
				ready: true
			});
			return { ok: true as const, needsEmailConfirmation: false };
		}

		return { ok: true as const, needsEmailConfirmation: true };
	},
	logout: async () => {
		if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(LOGOUT_FLAG_KEY, '1');
		if (typeof localStorage !== 'undefined') localStorage.setItem(LOGOUT_TS_KEY, String(Date.now()));
		saveSession(null);
		state.set({ ...initial, ready: true });
		// Limpiar sesión de Supabase (esperar hasta 3s; si cuelga, borrar storage igual)
		await Promise.race([
			supabase.auth.signOut(),
			new Promise<void>((r) => setTimeout(r, 3_000))
		]).catch(() => {});
		clearSupabaseAuthStorage();
		await goto('/login', { replaceState: true });
	},
	setShift(shift: Shift | null) {
		state.update((s) => ({ ...s, shift }));
	},
	updateUserProfile(payload: { name?: string; avatarUrl?: string | null }) {
		state.update((s) => {
			if (!s.user) return s;
			return {
				...s,
				user: {
					...s.user,
					name: payload.name ?? s.user.name,
					avatarUrl: payload.avatarUrl === undefined ? s.user.avatarUrl : payload.avatarUrl || undefined
				}
			};
		});
	}
};

export const isAuthenticated = derived(state, ($state) => Boolean($state.user));
