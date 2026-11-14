import { SupabaseClient } from '@supabase/supabase-js';
/**
 * Returns a singleton server-only administrative Supabase client using the SERVICE_ROLE_KEY.
 * WARNING: This client bypasses PostgreSQL Row-Level Security (RLS).
 * Must only be used in trusted backend services after explicit authorization checks.
 */
export declare function getAdminSupabaseClient(): SupabaseClient;
/**
 * Creates a request-scoped Supabase client for an authenticated user using the ANON_KEY
 * and the user's verified Bearer JWT token.
 * This client operates strictly under the user's database role and PostgreSQL RLS policies.
 */
export declare function createUserSupabaseClient(token: string): SupabaseClient;
//# sourceMappingURL=supabase.d.ts.map