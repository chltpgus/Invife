import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/env';

let supabase: SupabaseClient | null = null;
let signingIn: Promise<string | null> | null = null;

function supabaseClient(): SupabaseClient | null {
  if (env.dataSource !== 'api' || !env.supabaseUrl || !env.supabaseAnonKey) return null;
  supabase ??= createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return supabase;
}

/** api 모드에서만 익명 세션 access_token. 없거나 만료면 Supabase가 갱신하거나 새로 로그인한다. */
export async function accessToken(): Promise<string | null> {
  const client = supabaseClient();
  if (!client) return null;
  if (!signingIn) {
    signingIn = client.auth
      .getSession()
      .then(async (existing) => {
        if (existing.data.session?.access_token) return existing.data.session.access_token;
        const signed = await client.auth.signInAnonymously();
        if (signed.error || !signed.data.session) throw new Error('anonymous sign-in failed');
        return signed.data.session.access_token;
      })
      .finally(() => {
        signingIn = null;
      });
  }
  return signingIn;
}
