import { env } from '$env/dynamic/public';
import { createClient } from '@supabase/supabase-js';
import { createPosFetch, setSupabaseRef } from '$lib/network/supabaseFetch';

const supabaseUrl = env.PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = env.PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
	global: {
		fetch: createPosFetch()
	},
	auth: {
		persistSession: true,
		autoRefreshToken: true,
		detectSessionInUrl: true
	}
});

setSupabaseRef(() => supabase);
