export type TurnstileResult = 'ok' | 'failed' | 'unavailable';

export async function verifyTurnstile(token: string, ip: string, secret: string, hostname: string): Promise<TurnstileResult> {
  try {
    const body = new URLSearchParams({ secret, response: token, remoteip: ip });
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
    });
    if (!response.ok) return 'unavailable';
    const payload = (await response.json()) as { success?: boolean; hostname?: string };
    if (payload.success !== true) return 'failed';
    if (hostname && payload.hostname !== hostname) return 'failed';
    return 'ok';
  } catch {
    return 'unavailable';
  }
}
