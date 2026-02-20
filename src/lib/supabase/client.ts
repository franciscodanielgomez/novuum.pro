import { env } from '$env/dynamic/public';
import { createClient } from '@supabase/supabase-js';

const UPLOAD_TIMEOUT_MS = 120_000;

/** Llamado cuando una petición a la API REST devuelve 401 (sesión inválida). Registrado desde session store. */
let on401: (() => void) | null = null;
export function setOn401(handler: () => void): void {
	on401 = handler;
}

const fetchWithLongTimeout: typeof fetch = (input, init) => {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
	const signal = init?.signal;
	const once = { done: false };
	const onAbort = () => {
		if (once.done) return;
		once.done = true;
		clearTimeout(timeoutId);
		controller.abort();
	};
	if (signal) {
		if (signal.aborted) {
			clearTimeout(timeoutId);
			return Promise.reject(new DOMException('Aborted', 'AbortError'));
		}
		signal.addEventListener('abort', onAbort, { once: true });
	}
	return fetch(input, { ...init, signal: controller.signal }).finally(() => {
		if (!once.done) {
			once.done = true;
			clearTimeout(timeoutId);
		}
		if (signal) signal.removeEventListener('abort', onAbort);
	});
};

/** Fetch que intercepta 401 en la API REST de Supabase y dispara cierre de sesión + redirect a login. */
const fetchWith401Handling: typeof fetch = (input, init) => {
	const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
	return fetchWithLongTimeout(input, init).then((res) => {
		if (res.status === 401 && url.includes('/rest/v1/')) {
			on401?.();
		}
		return res;
	});
};

const supabaseUrl = env.PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = env.PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
	auth: {
		persistSession: true,
		autoRefreshToken: true,
		detectSessionInUrl: true
	},
	db: { timeout: UPLOAD_TIMEOUT_MS },
	global: { fetch: fetchWith401Handling }
});
