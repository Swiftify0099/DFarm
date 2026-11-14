import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from './env.js';

let adminClientInstance: SupabaseClient | null = null;

/**
 * Returns a singleton server-only administrative Supabase client using the SERVICE_ROLE_KEY.
 * WARNING: This client bypasses PostgreSQL Row-Level Security (RLS).
 * Must only be used in trusted backend services after explicit authorization checks.
 */
export function getAdminSupabaseClient(): SupabaseClient {
  if (!adminClientInstance) {
    adminClientInstance = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return adminClientInstance;
}

/**
 * Creates a request-scoped Supabase client for an authenticated user using the ANON_KEY
 * and the user's verified Bearer JWT token.
 * This client operates strictly under the user's database role and PostgreSQL RLS policies.
 */
export function createUserSupabaseClient(token: string): SupabaseClient {
  return createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

