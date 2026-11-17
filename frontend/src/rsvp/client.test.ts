import { describe, expect, it } from 'vitest';
import type { MemoryStore } from '@/rsvp/client';
import { createFixtureRsvpClient } from '@/rsvp/fixture-client';

function memory(): MemoryStore {
  const data = new Map<string, string>();
  return {
    get: (key) => data.get(key) ?? null,
    set: (key, value) => {
      data.set(key, value);
    },
  };
}

describe('샘플 RSVP', () => {
  it('개인 링크는 이름을 채우고, 없는 토큰은 404다', async () => {
    const client = createFixtureRsvpClient(memory(), () => new Date('2027-01-01T00:00:00.000Z'));
    const personal = await client.context({ slug: 'minjun-seoyeon', token: 'jihun' });
    expect(personal.ok && personal.context.prefillName).toBe('김지훈');
    expect(personal.ok && personal.context.response).toBeNull();
    const missing = await client.context({ slug: 'minjun-seoyeon', token: 'nope' });
    expect(missing).toEqual({ ok: false, code: 'not_found' });
  });

  it('폐기된 토큰은 이름과 기존 응답을 주지 않는다', async () => {
    const client = createFixtureRsvpClient(memory(), () => new Date('2027-01-01T00:00:00.000Z'));
    const revoked = await client.context({ slug: 'minjun-seoyeon', token: 'old-link' });
    expect(revoked.ok && revoked.context.revoked).toBe(true);
    expect(revoked.ok && revoked.context.prefillName).toBeUndefined();
    expect(revoked.ok && revoked.context.response).toBeUndefined();
    const submit = await client.submit({
      slug: 'minjun-seoyeon',
      channel: 'personal',
      token: 'old-link',
      name: '다른사람',
      attending: true,
      companions: 0,
    });
    expect(submit).toEqual({ ok: false, code: 'revoked' });
  });

  it('공용 초대장은 토큰 없이 invite 이고, 첫 응답에만 editKey 가 온다', async () => {
    const store = memory();
    const client = createFixtureRsvpClient(store, () => new Date('2027-01-01T00:00:00.000Z'));
    const context = await client.context({ slug: 'minjun-seoyeon' });
    expect(context.ok && context.context.link).toBe('invite');
    expect(context.ok && 'token' in context.context).toBe(false);
    const created = await client.submit({
      slug: 'minjun-seoyeon',
      channel: 'invite',
      name: '박하늘',
      attending: true,
      companions: 1,
    });
    expect(created.ok && created.editKey).toBeTruthy();
    if (!created.ok) return;
    const rejected = await client.submit({
      slug: 'minjun-seoyeon',
      channel: 'invite',
      name: '박하늘',
      attending: false,
      companions: 0,
      responseId: created.response.id,
    });
    expect(rejected).toEqual({ ok: false, code: 'edit_forbidden' });
    const edited = await client.submit({
      slug: 'minjun-seoyeon',
      channel: 'invite',
      name: '박하늘',
      attending: false,
      companions: 0,
      responseId: created.response.id,
      editKey: created.editKey,
    });
    expect(edited.ok && edited.edited).toBe(true);
  });

  it('불참인데 동행이 있으면 거절한다', async () => {
    const client = createFixtureRsvpClient(memory(), () => new Date('2027-01-01T00:00:00.000Z'));
    const result = await client.submit({
      slug: 'minjun-seoyeon',
      channel: 'rsvp_link',
      token: 'open-rsvp',
      name: '박하늘',
      attending: false,
      companions: 2,
    });
    expect(result).toMatchObject({ ok: false, code: 'validation', field: 'companions' });
  });
});
