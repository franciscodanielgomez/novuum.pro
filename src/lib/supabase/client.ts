import { env } from '$env/dynamic/public';
import { createClient } from '@supabase/supabase-js';

const UPLOAD_TIMEOUT_MS = 120_000;

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

const supabaseUrl = env.PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = env.PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
	auth: {
		persistSession: true,
		autoRefreshToken: true,
		detectSessionInUrl: true
	},
	db: { timeout: UPLOAD_TIMEOUT_MS },
	global: { fetch: fetchWithLongTimeout }
});
