import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { api } from '$lib/api';
import { supabase } from '$lib/supabase/client';
import type { AppUser, SessionData, Shift } from '$lib/types';
import { derived, writable } from 'svelte/store';
import type { User } from '@supabase/supabase-js';

const SESSION_KEY = 'grido_v0_session';

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

const mapUser = async (user: User | null): Promise<AppUser | null> => {
	if (!user?.id || !user.email) return null;
	let role: AppUser['role'] = 'CAJERO';
	let displayName = ((user.user_metadata?.name as string | undefined) ?? '').trim();
	let avatarUrl = ((user.user_metadata?.avatar_url as string | undefined) ?? '').trim();
	const { data } = await supabase.from('team_members').select('role').eq('id', user.id).maybeSingle();
	if (data?.role) role = mapLegacyRole(data.role);
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
		const raw = localStorage.getItem(SESSION_KEY);
		let localLocation: SessionData['location'] = 'Ituzaingó';
		if (raw) {
			try {
				localLocation = (JSON.parse(raw) as SessionData).location ?? 'Ituzaingó';
			} catch {
				localLocation = 'Ituzaingó';
			}
		}
		let shift: Shift | null = null;
		let user: User | null = null;
		try {
			shift = await api.shifts.getOpen();
		} catch {
			// Sin conexión con la API
		}
		try {
			const { data } = await supabase.auth.getUser();
			user = data?.user ?? null;
		} catch {
			// Supabase auth no disponible
		}
		let mappedUser: AppUser | null = null;
		try {
			mappedUser = await mapUser(user);
		} catch {
			// Perfil no cargó; usar datos básicos del auth si hay user
			if (user?.id && user?.email) {
				mappedUser = {
					id: user.id,
					email: user.email,
					name: (user.user_metadata?.name as string)?.trim() || user.email,
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

		if (listenerInitialized) return;
		listenerInitialized = true;
		supabase.auth.onAuthStateChange(async (_event, session) => {
			try {
				const mapped = await mapUser(session?.user ?? null);
				state.update((s) => ({
					...s,
					user: mapped,
					ready: true
				}));
			} catch {
				state.update((s) => ({
					...s,
					user: session?.user ? {
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
			saveSession({ location: 'Ituzaingó' });
			const shift = await api.shifts.getOpen();
			const mappedUser = await mapUser(data.user);
			state.set({
				user: mappedUser,
				location: 'Ituzaingó',
				shift,
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

		saveSession({ location: 'Ituzaingó' });
		if (data.session?.user) {
			const shift = await api.shifts.getOpen();
			const mappedUser = await mapUser(data.session.user);
			state.set({
				user: mappedUser,
				location: 'Ituzaingó',
				shift,
				ready: true
			});
			return { ok: true as const, needsEmailConfirmation: false };
		}

		return { ok: true as const, needsEmailConfirmation: true };
	},
	logout: async () => {
		await supabase.auth.signOut();
		saveSession(null);
		state.set({ ...initial, ready: true });
		await goto('/login');
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
