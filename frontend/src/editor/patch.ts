import { FULL_CROP, splitAddress, type EditorDraft } from '@/domain/editor';
import type { Account, Parent } from '@/domain/types';
import type { AutosaveBody, EditorAccount, EditorInvitation, FamilySide, ParentInput, PhotoFilter } from '@/editor/contract';

export function planAutosave(saved: EditorInvitation, draft: EditorDraft): AutosaveBody | null {
  const body: AutosaveBody = {};
  if (draft.invitation.theme !== saved.theme) body.theme = draft.invitation.theme;
  if (draft.photoTone !== saved.photoFilter) body.photoFilter = draft.photoTone;

  const groom = personPatch(saved.groom, draft.invitation.groom);
  const bride = personPatch(saved.bride, draft.invitation.bride);
  if (groom) body.groom = groom;
  if (bride) body.bride = bride;

  const ceremony = ceremonyPatch(saved, draft);
  if (ceremony) body.ceremony = ceremony;
  if ((draft.invitation.greeting ?? '') !== saved.greeting) body.greeting = draft.invitation.greeting ?? '';
  const transport = transportPatch(saved, draft);
  if (transport) body.transport = transport;
  if ((draft.invitation.accountsNote ?? '') !== saved.accountsNote) body.accountsNote = draft.invitation.accountsNote ?? '';
  if (!sameJson(saved.families, familiesOf(draft))) body.families = familiesOf(draft);

  const accounts = accountsPatch(saved.accounts, draft.invitation.accounts);
  if (accounts) body.accounts = accounts;

  const photos = photosPatch(saved, draft);
  if (photos) body.photos = photos;

  if (draft.deadlineCustom) {
    const deadline = draft.invitation.rsvp.deadline;
    if (deadline && (!saved.rsvp.deadlineOverride || saved.rsvp.deadline !== deadline)) body.rsvp = { deadline };
  } else if (saved.rsvp.deadlineOverride) {
    body.rsvp = { deadline: null };
  }

  return Object.keys(body).length ? body : null;
}

function personPatch(saved: EditorInvitation['groom'], local: EditorDraft['invitation']['groom']): NonNullable<AutosaveBody['groom']> | undefined {
  const patch: NonNullable<AutosaveBody['groom']> = {};
  if (local.name !== saved.name) patch.name = local.name;
  if (local.givenName !== saved.givenName) patch.givenName = local.givenName;
  const phone = (local.phone ?? '').trim();
  if (phone !== saved.phone) patch.phone = phone;
  return Object.keys(patch).length ? patch : undefined;
}

function ceremonyPatch(saved: EditorInvitation, draft: EditorDraft): AutosaveBody['ceremony'] | undefined {
  const address = splitAddress(draft.invitation.ceremony.address);
  const local = {
    date: /^\d{4}-\d{2}-\d{2}$/.test(draft.invitation.ceremony.date) ? draft.invitation.ceremony.date : null,
    time: draft.invitation.ceremony.time || null,
    venueName: draft.invitation.ceremony.venueName,
    hall: draft.invitation.ceremony.hall ?? '',
    address: address.road,
    addressDetail: address.detail,
    lat: draft.invitation.ceremony.lat ?? null,
    lng: draft.invitation.ceremony.lng ?? null,
  };
  const patch: NonNullable<AutosaveBody['ceremony']> = {};
  for (const key of Object.keys(local) as Array<keyof typeof local>) {
    if (local[key] !== saved.ceremony[key]) patch[key] = local[key] as never;
  }
  return Object.keys(patch).length ? patch : undefined;
}

function transportPatch(saved: EditorInvitation, draft: EditorDraft): AutosaveBody['transport'] | undefined {
  const source = draft.invitation.transport;
  const local = {
    parking: source?.parking ?? '',
    subway: source?.subway ?? '',
    bus: source?.bus ?? '',
    other: source?.other ?? '',
  };
  const patch: NonNullable<AutosaveBody['transport']> = {};
  for (const key of Object.keys(local) as Array<keyof typeof local>) {
    if (local[key] !== saved.transport[key]) patch[key] = local[key];
  }
  return Object.keys(patch).length ? patch : undefined;
}

function familiesOf(draft: EditorDraft): { groom: FamilySide; bride: FamilySide } {
  return {
    groom: sideOf(draft, 'groom', '아들'),
    bride: sideOf(draft, 'bride', '딸'),
  };
}

function sideOf(draft: EditorDraft, side: 'groom' | 'bride', relation: string): FamilySide {
  const source = draft.invitation.families[side];
  return {
    relation: source?.relation ?? relation,
    father: parentInput(source?.father),
    mother: parentInput(source?.mother),
  };
}

function parentInput(parent: Parent | undefined): ParentInput {
  return {
    name: parent?.name ?? '',
    phone: parent?.deceased ? '' : (parent?.phone ?? ''),
    deceased: Boolean(parent?.deceased),
    deceasedStyle: parent?.deceased ? (parent.deceasedStyle ?? null) : null,
  };
}

function accountsPatch(saved: EditorAccount[], local: Account[]): AutosaveBody['accounts'] | undefined {
  const ready = local
    .filter((account) => account.holder.trim() || account.bank.trim() || account.number.trim())
    .map((account) => ({
      id: account.id,
      side: account.side,
      relation: account.relation.trim(),
      holder: account.holder.trim(),
      bank: account.bank.trim(),
      number: account.number.trim(),
    }));
  if (sameJson(saved, ready)) return undefined;
  return ready;
}

function photosPatch(saved: EditorInvitation, draft: EditorDraft): AutosaveBody['photos'] | undefined {
  const known = new Map(saved.photos.map((photo) => [photo.id, photo]));
  const local = draft.invitation.photos.flatMap((photo, sort) => {
    const server = known.get(photo.id);
    if (!server) return [];
    const adjust = draft.photoAdjust[photo.id] ?? { crop: FULL_CROP, filter: draft.photoTone as PhotoFilter };
    const wantedCrop = sameCrop(adjust.crop, FULL_CROP) ? undefined : adjust.crop;
    const wantedFilter = adjust.filter === server.filter ? undefined : adjust.filter;
    const focalChanged = photo.focal.x !== server.focal.x || photo.focal.y !== server.focal.y;
    const sortChanged = sort !== server.sort;
    const cropChanged = wantedCrop ? !sameCrop(wantedCrop, server.crop) : !sameCrop(server.crop, FULL_CROP);
    if (!focalChanged && !sortChanged && !cropChanged && !wantedFilter) return [];
    const item: NonNullable<AutosaveBody['photos']>[number] = { id: photo.id, sort, focal: photo.focal };
    if (wantedCrop) item.crop = wantedCrop;
    if (wantedFilter) item.filter = wantedFilter;
    return [item];
  });
  return local.length ? local : undefined;
}

function sameCrop(left: { x: number; y: number; width: number; height: number }, right: { x: number; y: number; width: number; height: number }): boolean {
  return left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
