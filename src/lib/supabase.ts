import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from '@/lib/env';

let supabaseAdminClient: SupabaseClient | null = null;
let supabasePublicClient: SupabaseClient | null = null;

/**
 * Returns a Supabase client with admin / service role privileges.
 * Use for secure server-side mutations, bypass of RLS where appropriate,
 * and database operations in API routes and worker handlers.
 */
export function getSupabaseAdminClient(): SupabaseClient | null {
  const url = getEnv('NEXT_PUBLIC_SUPABASE_URL') || getEnv('SUPABASE_URL');
  const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY') || getEnv('SUPABASE_SERVICE_KEY') || getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  if (!url || !serviceKey) {
    return null;
  }

  if (!supabaseAdminClient) {
    supabaseAdminClient = createClient(url, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return supabaseAdminClient;
}

/**
 * Returns a public Supabase client using anon key.
 * Safe for client-side or public read queries.
 */
export function getSupabasePublicClient(): SupabaseClient | null {
  const url = getEnv('NEXT_PUBLIC_SUPABASE_URL') || getEnv('SUPABASE_URL');
  const anonKey = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') || getEnv('SUPABASE_ANON_KEY');

  if (!url || !anonKey) {
    return null;
  }

  if (!supabasePublicClient) {
    supabasePublicClient = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return supabasePublicClient;
}

/**
 * Convenience helper to check if Supabase is configured in the current environment.
 */
export function isSupabaseConfigured(): boolean {
  const url = getEnv('NEXT_PUBLIC_SUPABASE_URL') || getEnv('SUPABASE_URL');
  const key = getEnv('SUPABASE_SERVICE_ROLE_KEY') || getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return Boolean(url && key);
}
