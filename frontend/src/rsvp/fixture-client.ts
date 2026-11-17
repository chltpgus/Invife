import { invitations } from '@/data/fixtures';
import { isDeadlineClosed } from '@/domain/dates';
import { editStorageKey, normalizeGuestName, readStoredEdit, validateGuestName } from '@/domain/rsvp';
import type { RsvpContext, RsvpContextResult, RsvpResponse, StoredEdit } from '@/domain/types';
import type { MemoryStore, RsvpClient } from '@/rsvp/client';
import { sampleDirectory } from '@/rsvp/fixture-directory';

const personalEdits = new Map<string, RsvpResponse>();

function deadlineFor(slug: string): string | null {
  return invitations.find((invitation) => invitation.slug === slug)?.rsvp.deadline ?? null;
}

function contextFor(slug: string, token: string | undefined, now: Date): RsvpContextResult {
  const sample = sampleDirectory.find((item) => item.slug === slug);
  const deadline = deadlineFor(slug);
  if (!sample || !deadline) return { ok: false, code: 'not_found' };
  if (sample.unavailable) return { ok: false, code: 'unavailable' };
  const closed = isDeadlineClosed(now, deadline);
  const status = closed ? 'closed' : 'open';
  if (!token) return { ok: true, context: { status, deadline, link: 'invite' } };
  if (token === sample.rsvpToken) return { ok: true, context: { status, deadline, link: 'rsvp_link' } };
  const recipient = sample.recipients.find((item) => item.token === token);
  if (!recipient) return { ok: false, code: 'not_found' };
  if (recipient.revoked) {
    return { ok: true, context: { status, deadline, link: 'personal', revoked: true } };
  }
  const response = personalEdits.get(`${slug}:${token}`) ?? recipient.response;
  const context: RsvpContext = {
    status,
    deadline,
    link: 'personal',
    prefillName: recipient.name,
    response,
  };
  return { ok: true, context };
}

function writeEdit(store: MemoryStore, key: string, edit: StoredEdit) {
  store.set(key, JSON.stringify(edit));
}

export function createFixtureRsvpClient(store: MemoryStore, now = () => new Date()): RsvpClient {
  return {
    async context(input) {
      return contextFor(input.slug, input.token, now());
    },
    async submit(body) {
      const sample = sampleDirectory.find((item) => item.slug === body.slug);
      if (!sample) return { ok: false, code: 'not_found' };
      if (sample.unavailable) return { ok: false, code: 'unavailable' };
      const deadline = deadlineFor(body.slug);
      if (deadline && isDeadlineClosed(now(), deadline)) return { ok: false, code: 'closed' };
      if (body.channel === 'personal') {
        const recipient = sample.recipients.find((item) => item.token === body.token);
        if (!recipient || !body.token) return { ok: false, code: 'not_found' };
        if (recipient.revoked) return { ok: false, code: 'revoked' };
      } else if (body.channel === 'rsvp_link' && body.token !== sample.rsvpToken) {
        return { ok: false, code: 'not_found' };
      }
      if (!body.attending && body.companions !== 0) {
        return { ok: false, code: 'validation', field: 'companions', reason: 'not_zero' };
      }
      const name = normalizeGuestName(body.name ?? '');
      const nameError = validateGuestName(name);
      if (nameError) {
        return { ok: false, code: 'validation', field: 'name', reason: [...name].length > 20 ? 'too_long' : 'required' };
      }
      const updatedAt = now().toISOString();
      if (body.channel === 'personal' && body.token) {
        const previous = personalEdits.get(`${body.slug}:${body.token}`) ?? sample.recipients.find((item) => item.token === body.token)?.response;
        const response: RsvpResponse = {
          id: previous?.id ?? `local-${body.slug}-${body.token}`,
          attending: body.attending,
          companions: body.companions,
          name,
          updatedAt,
        };
        personalEdits.set(`${body.slug}:${body.token}`, response);
        return { ok: true, response, edited: Boolean(previous) };
      }
      const channel = body.channel === 'rsvp_link' ? 'rsvp_link' : 'invite';
      const key = editStorageKey(body.slug, channel, body.token);
      if (body.responseId) {
        const saved = readStoredEdit(store.get(key));
        if (!saved || saved.editKey !== body.editKey || saved.responseId !== body.responseId) {
          return { ok: false, code: 'edit_forbidden' };
        }
        const response: RsvpResponse = { ...saved.response, attending: body.attending, companions: body.companions, name, updatedAt };
        writeEdit(store, key, { responseId: response.id, editKey: saved.editKey, response });
        return { ok: true, response, edited: true };
      }
      const response: RsvpResponse = {
        id: `local-${body.slug}-${body.channel}`,
        attending: body.attending,
        companions: body.companions,
        name,
        updatedAt,
      };
      const editKey = `edit-${body.slug}-${body.channel}`;
      writeEdit(store, key, { responseId: response.id, editKey, response });
      return { ok: true, response, edited: false, editKey };
    },
  };
}
