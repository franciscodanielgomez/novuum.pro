import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { api } from '$lib/api';
import { supabase } from '$lib/supabase/client';
import type { AppUser, SessionData, Shift } from '$lib/types';
import { toastsStore } from '$lib/stores/toasts';
import { sessionLog, sessionWarn } from '$lib/session-debug';
import { posAuthLog, posAuthWarn } from '$lib/pos/diagnostics';
import { refreshSessionSingleFlight, setPosFetchAuthHandlers } from '$lib/network/supabaseFetch';
import { derived, get, writable } from 'svelte/store';
import type { User } from '@supabase/supabase-js';

export type AuthStatus = 'ok' | 'refreshing' | 'offline' | 'hard-expired';

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
	authStatus: AuthStatus;
	lastRefreshAt: number | null;
	lastAuthError: string | null;
};

const initial: SessionState = {
	user: null,
	location: 'Ituzaingó',
	shift: null,
	ready: false,
	authStatus: 'ok',
	lastRefreshAt: null,
	lastAuthError: null
};

const state = writable<SessionState>(initial);
let listenerInitialized = false;

/** En POS usamos autoRefreshToken de Supabase y el wrapper supabaseFetch para 401. */

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
	const data = await api.teamMembers.getById(user.id);
	if (data) {
		const rolesArr = Array.isArray((data as { roles?: string[] }).roles) && (data as { roles?: string[] }).roles!.length > 0
			? (data as { roles: string[] }).roles
			: [(data as { role?: string }).role].filter(Boolean) as string[];
		if (rolesArr.includes('ADMINISTRADOR')) role = 'ADMINISTRADOR';
		else if (rolesArr.length > 0) role = mapLegacyRole(rolesArr[0]);
		else if (data.role) role = mapLegacyRole(data.role);
	}
	const profileData = await api.userProfiles.getById(user.id);
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
		sessionLog('hydrate() start');
		let localLocation: SessionData['location'] = 'Ituzaingó';
		try {
			const raw = localStorage.getItem(SESSION_KEY);
			if (raw) {
				try {
					localLocation = (JSON.parse(raw) as SessionData).location ?? 'Ituzaingó';
				} catch {
					localLocation = 'Ituzaingó';
				}
			}
			// Evitar lock contention: hydrate usa getSession (lectura), no refreshSession agresivo.
			const { data: sessionData } = await supabase.auth.getSession();
			const user: User | null = sessionData?.session?.user ?? null;
			const minimal = minimalUserFromAuth(user);
			if (!user) {
				state.update((s) => ({
					...s,
					location: localLocation,
					ready: true,
					authStatus: s.user ? 'offline' : s.authStatus,
					lastAuthError: s.user ? 'hydrate_no_user' : s.lastAuthError
				}));
				sessionWarn('hydrate() sin user; manteniendo sesión local para evitar logout transitorio');
				return;
			}
			state.update((s) => ({
				...s,
				user: minimal,
				location: localLocation,
				shift: null,
				ready: true,
				authStatus: 'ok',
				lastAuthError: null
			}));
			sessionLog('hydrate() user ok, completando perfil en segundo plano');
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
				state.update((s) => ({
					...s,
					user: mappedUser,
					location: localLocation,
					shift,
					ready: true
				}));
			})();
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			state.update((s) => ({
				...s,
				location: localLocation,
				ready: true,
				authStatus: s.user ? 'offline' : s.authStatus,
				lastAuthError: msg
			}));
			sessionWarn('hydrate() error', msg);
		} finally {
			clearTimeout(readyTimeoutId);
		}

		if (listenerInitialized) return;
		listenerInitialized = true;

		// Nunca emitimos GLOBAL_REFRESH/refreshTrigger desde aquí; evita tormenta al volver de background.
		const IGNORE_REFRESH_EVENTS = new Set<string>(['INITIAL_SESSION', 'TOKEN_REFRESHED', 'SIGNED_IN']);
		supabase.auth.onAuthStateChange(async (event, session) => {
			if (browser) console.debug('[auth] onAuthStateChange', { event });
			if (event === 'SIGNED_OUT') {
				state.update((s) => ({ ...s, user: null, ready: true }));
				return;
			}
			if (!session) {
				state.update((s) => ({ ...s, ready: true, authStatus: s.user ? 'offline' : s.authStatus }));
				return;
			}
			// INITIAL_SESSION / TOKEN_REFRESHED / SIGNED_IN: solo sincronizar user mínimo; NO emitir GLOBAL_REFRESH.
			if (IGNORE_REFRESH_EVENTS.has(event)) {
				const minimal = minimalUserFromAuth(session.user);
				state.update((s) => ({ ...s, user: minimal, ready: true }));
				if (browser) {
					console.debug('[auth] no GLOBAL_REFRESH', { reason: 'sync_only', event });
				}
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
			const LOGIN_TIMEOUT_MS = 12_000;
			const signInResult = await Promise.race([
				supabase.auth.signInWithPassword({ email, password }),
				new Promise<{ data: null; error: { message: string } }>((resolve) =>
					setTimeout(() => resolve({ data: null, error: { message: 'timeout' } }), LOGIN_TIMEOUT_MS)
				)
			]);
			const { data, error } = signInResult;
			if (error || !data.user) {
				if (error?.message === 'timeout') {
					return { ok: false, message: 'El inicio de sesi?n tard? demasiado. Revis? tu conexi?n e intent? nuevamente.' };
				}
				return { ok: false, message: error?.message ?? 'No se pudo iniciar sesi?n' };
			}
			if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(LOGOUT_FLAG_KEY);
			if (typeof localStorage !== 'undefined') localStorage.removeItem(LOGOUT_TS_KEY);
			saveSession({ location: 'Ituzaingó' });
			// No esperar getOpen ni mapUser: pueden colgar y dejan el login en "cargando". El layout hará hydrate() al cargar /app.
			const minimal = minimalUserFromAuth(data.user);
			state.update((s) => ({
				...s,
				user: minimal,
				location: 'Ituzaingó',
				shift: null,
				ready: true
			}));
			return { ok: true as const };
		} catch {
			return { ok: false, message: 'Error inesperado al iniciar sesi?n' };
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
			state.update((s) => ({
				...s,
				user: minimal,
				location: 'Ituzaingó',
				shift: null,
				ready: true
			}));
			return { ok: true as const, needsEmailConfirmation: false };
		}

		return { ok: true as const, needsEmailConfirmation: true };
	},
	/**
	 * Cierra sesión por sesión inválida (ej. 401). Muestra toast y redirige a login.
	 * Usado por el fetch del cliente Supabase cuando detecta 401 en la API REST.
	 */
	clearSessionAndRedirectToLogin: (reason?: string) => {
		if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(LOGOUT_FLAG_KEY, '1');
		if (typeof localStorage !== 'undefined') localStorage.setItem(LOGOUT_TS_KEY, String(Date.now()));
		saveSession(null);
		state.set({ ...initial, ready: true });
		toastsStore.error(reason ?? 'La sesión venció. Volvé a iniciar sesión.');
		Promise.race([
			supabase.auth.signOut(),
			new Promise<void>((r) => setTimeout(r, 3_000))
		])
			.catch(() => {})
			.finally(() => {
				clearSupabaseAuthStorage();
				goto('/login', { replaceState: true });
			});
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
	refreshToken: async (): Promise<{ hasSession: boolean }> => {
		if (!browser) return { hasSession: false };
		posAuthLog('[auth] refresh start');
		try {
			const result = await refreshSessionSingleFlight();
			if (result.ok) {
				state.update((s) => ({
					...s,
					authStatus: 'ok',
					lastRefreshAt: Date.now(),
					lastAuthError: null
				}));
				posAuthLog('[auth] refresh ok');
				return { hasSession: true };
			}
			state.update((s) => ({
				...s,
				authStatus: result.invalidGrant ? 'hard-expired' : s.user ? 'offline' : s.authStatus,
				lastRefreshAt: Date.now(),
				lastAuthError: result.invalidGrant ? 'invalid_grant' : 'refresh_failed'
			}));
			posAuthWarn('[auth] refresh fail', {
				invalidGrant: result.invalidGrant
			});
			return { hasSession: false };
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			state.update((s) => ({
				...s,
				authStatus: s.authStatus === 'hard-expired' ? s.authStatus : 'offline',
				lastRefreshAt: Date.now(),
				lastAuthError: msg
			}));
			posAuthWarn('[auth] refresh error', msg);
			return { hasSession: false };
		} finally {
			posAuthLog('[auth] refresh end');
		}
	},
	ensureValidSession: async (opts?: { maxWaitMs?: number }): Promise<{ hasSession: boolean }> => {
		const maxWaitMs = opts?.maxWaitMs ?? 5_000;
		const result = await Promise.race([
			sessionStore.refreshToken(),
			new Promise<{ hasSession: false }>((r) => setTimeout(() => r({ hasSession: false }), maxWaitMs))
		]);
		return result;
	},
	setAuthHardExpired() {
		state.update((s) => ({ ...s, authStatus: 'hard-expired' }));
		posAuthWarn('auth hard-expired (invalid_grant / refresh revoked)');
	},
	setAuthOffline() {
		state.update((s) => (s.authStatus === 'hard-expired' ? s : { ...s, authStatus: 'offline' }));
		posAuthWarn('auth offline (red/timeout)');
	},
	/** Actualiza nombre, rol y avatar del usuario en el menú (sin tocar auth). Útil tras inactividad o al volver a la app. */
	refreshUserProfile: async () => {
		if (!browser) return;
		const s = get(state);
		if (!s.user?.id) return;
		try {
			const { data } = await supabase.auth.getSession();
			const user: User | null = data?.session?.user ?? null;
			if (!user?.id) return;
			const mapped = await mapUser(user);
			if (mapped) {
				state.update((prev) => (prev.user ? { ...prev, user: mapped } : prev));
			}
		} catch {
			// No bloquear ni mostrar error; el menú sigue con datos anteriores
		}
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

if (browser) {
	setPosFetchAuthHandlers({
		onHardExpired: () => sessionStore.setAuthHardExpired(),
		onOffline: () => sessionStore.setAuthOffline()
	});
}

export const isAuthenticated = derived(state, ($state) => Boolean($state.user));
