import { env } from '$env/dynamic/public';
import { createClient } from '@supabase/supabase-js';
import { createPosFetch } from '$lib/network/supabaseFetch';

const supabaseUrl = env.PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = env.PUBLIC_SUPABASE_ANON_KEY ?? '';

// Ref resuelto después de createClient para que createPosFetch no toque supabase al construir.
const supabaseRef: { current: ReturnType<typeof createClient> | null } = { current: null };

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
	global: {
		fetch: createPosFetch(() => supabaseRef.current!)
	},
	auth: {
		persistSession: true,
		autoRefreshToken: true,
		detectSessionInUrl: true
	}
});

supabaseRef.current = supabase as ReturnType<typeof createClient>;
export { supabase };
