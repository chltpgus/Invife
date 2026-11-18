import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { alreadyLinkedMessage, callbackAlreadyLinked } from '@/editor/contract';
import { env } from '@/env';

let supabase: SupabaseClient | null = null;
let signingIn: Promise<string | null> | null = null;

function supabaseClient(): SupabaseClient | null {
  if (env.dataSource !== 'api' || !env.supabaseUrl || !env.supabaseAnonKey) return null;
  supabase ??= createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
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

export type KakaoAuthResult =
  | { ok: true; mode: 'linked'; redirected: boolean }
  | { ok: false; code: 'unconfigured' | 'failed' | 'cancelled' }
  | { ok: false; code: 'existing_account'; message: string };

/** 카카오 키가 없어도 예외를 던지지 않는다. 로그인 제공자는 Supabase 설정에 있다. */
export async function linkKakaoIdentity(redirectTo: string): Promise<KakaoAuthResult> {
  const client = supabaseClient();
  if (!client) return { ok: false, code: 'unconfigured' };
  const linked = await client.auth.linkIdentity({ provider: 'kakao', options: { redirectTo } });
  if (!linked.error) return { ok: true, mode: 'linked', redirected: true };
  if (alreadyLinkedMessage(linked.error.message)) return { ok: false, code: 'existing_account', message: linked.error.message };
  return { ok: false, code: 'failed' };
}

export { callbackAlreadyLinked };

export async function signInWithKakao(redirectTo: string): Promise<KakaoAuthResult> {
  const client = supabaseClient();
  if (!client) return { ok: false, code: 'unconfigured' };
  const signed = await client.auth.signInWithOAuth({ provider: 'kakao', options: { redirectTo } });
  if (signed.error) return { ok: false, code: 'failed' };
  return { ok: true, mode: 'linked', redirected: true };
}
