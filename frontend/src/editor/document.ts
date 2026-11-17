import { defaultRsvpDeadline } from '@/domain/dates';
import { joinAddress, type EditorDraft } from '@/domain/editor';
import type { Invitation, Photo } from '@/domain/types';
import type { AutosaveBody, CreateInvitationBody, EditorInvitation, EditorPhoto, FamilySide, ParentInput } from '@/editor/contract';
import { contentEtag } from '@/editor/etag';

export function blankInvitation(input: CreateInvitationBody, now: Date, id: string, slug: string): EditorInvitation {
  const date = input.ceremonyDate && /^\d{4}-\d{2}-\d{2}$/.test(input.ceremonyDate) ? input.ceremonyDate : null;
  const time = input.ceremonyTime && /^\d{2}:\d{2}$/.test(input.ceremonyTime) ? input.ceremonyTime : null;
  const groomName = input.groomName?.trim() ?? '';
  const brideName = input.brideName?.trim() ?? '';
  const stamp = now.toISOString();
  const invitation: EditorInvitation = {
    id,
    slug,
    status: 'draft',
    theme: input.theme ?? 'ivory',
    photoFilter: 'original',
    groom: { name: groomName, givenName: '', phone: '' },
    bride: { name: brideName, givenName: '', phone: '' },
    ceremony: { date, time, venueName: '', hall: '', address: '', addressDetail: '', lat: null, lng: null },
    greeting: '',
    families: { groom: emptySide('아들'), bride: emptySide('딸') },
    photos: [],
    transport: { parking: '', subway: '', bus: '', other: '' },
    accountsNote: '',
    accounts: [],
    rsvp: { deadline: date ? defaultRsvpDeadline(date).toISOString() : null, deadlineOverride: false },
    links: { invitePath: `/i/${slug}/`, rsvpLinkPath: null },
    checklist: [],
    hasUnpublishedChanges: false,
    purgeAt: null,
    createdAt: stamp,
    updatedAt: stamp,
    etag: '',
    publishedAt: null,
  };
  invitation.etag = contentEtag(invitation);
  return invitation;
}

export function applyAutosave(invitation: EditorInvitation, body: AutosaveBody, now: Date): EditorInvitation {
  const next: EditorInvitation = structuredClone(invitation);
  if (body.theme) next.theme = body.theme;
  if (body.photoFilter) {
    next.photoFilter = body.photoFilter;
    const explicit = new Set((body.photos ?? []).filter((item) => item.filter).map((item) => item.id));
    for (const photo of next.photos) {
      if (explicit.has(photo.id) || photo.filter === body.photoFilter) continue;
      photo.filter = body.photoFilter;
      if (photo.src) photo.status = 'processing';
    }
  }
  if (body.groom) next.groom = { ...next.groom, ...body.groom };
  if (body.bride) next.bride = { ...next.bride, ...body.bride };
  if (body.ceremony) next.ceremony = { ...next.ceremony, ...body.ceremony };
  if (body.greeting !== undefined) next.greeting = body.greeting;
  if (body.families) next.families = body.families;
  if (body.transport) next.transport = { ...next.transport, ...body.transport };
  if (body.accountsNote !== undefined) next.accountsNote = body.accountsNote;
  if (body.accounts) {
    next.accounts = body.accounts.map((account) => ({
      id: account.id ?? crypto.randomUUID(),
      side: account.side,
      relation: account.relation,
      holder: account.holder,
      bank: account.bank,
      number: account.number,
    }));
  }
  if (body.photos) {
    for (const item of body.photos) {
      const photo = next.photos.find((candidate) => candidate.id === item.id);
      if (!photo) continue;
      photo.sort = item.sort;
      if (item.focal) photo.focal = item.focal;
      const nextCrop = item.crop ?? { x: 0, y: 0, width: 1, height: 1 };
      const cropChanged = nextCrop.x !== photo.crop.x || nextCrop.y !== photo.crop.y || nextCrop.width !== photo.crop.width || nextCrop.height !== photo.crop.height;
      const filterChanged = item.filter !== undefined && item.filter !== photo.filter;
      photo.crop = nextCrop;
      if (item.filter) photo.filter = item.filter;
      if ((cropChanged || filterChanged) && photo.src) photo.status = 'processing';
    }
    next.photos.sort((a, b) => a.sort - b.sort);
  }
  if (body.rsvp && 'deadline' in body.rsvp) {
    if (body.rsvp.deadline === null) next.rsvp.deadlineOverride = false;
    if (body.rsvp.deadline) {
      next.rsvp.deadlineOverride = true;
      next.rsvp.deadline = body.rsvp.deadline;
    }
  }
  if (!next.rsvp.deadlineOverride) {
    next.rsvp.deadline = next.ceremony.date ? defaultRsvpDeadline(next.ceremony.date).toISOString() : null;
  }
  next.updatedAt = now.toISOString();
  next.etag = contentEtag(next);
  next.hasUnpublishedChanges = next.status === 'published';
  return next;
}

export function draftFromInvitation(invitation: EditorInvitation): EditorDraft {
  const invitationView: Invitation = {
    id: invitation.id,
    slug: invitation.slug,
    theme: invitation.theme,
    groom: { name: invitation.groom.name, givenName: invitation.groom.givenName, phone: invitation.groom.phone || undefined },
    bride: { name: invitation.bride.name, givenName: invitation.bride.givenName, phone: invitation.bride.phone || undefined },
    ceremony: {
      date: invitation.ceremony.date ?? '',
      time: invitation.ceremony.time ?? undefined,
      venueName: invitation.ceremony.venueName,
      hall: invitation.ceremony.hall || undefined,
      address: joinAddress(invitation.ceremony.address, invitation.ceremony.addressDetail),
      lat: invitation.ceremony.lat ?? undefined,
      lng: invitation.ceremony.lng ?? undefined,
    },
    greeting: invitation.greeting || undefined,
    families: {
      groom: sideFrom(invitation.families.groom),
      bride: sideFrom(invitation.families.bride),
    },
    photos: invitation.photos.flatMap((photo) => {
      const guest = guestPhoto(photo);
      return guest ? [guest] : [];
    }),
    transport: invitation.transport,
    accountsNote: invitation.accountsNote || undefined,
    accounts: invitation.accounts,
    rsvp: { deadline: invitation.rsvp.deadline ?? '' },
  };
  const photoAdjust: EditorDraft['photoAdjust'] = {};
  for (const photo of invitation.photos) {
    photoAdjust[photo.id] = { crop: photo.crop, filter: photo.filter };
  }
  return {
    invitation: invitationView,
    photoTone: invitation.photoFilter,
    photoAdjust,
    updatedAt: invitation.updatedAt,
    deadlineCustom: invitation.rsvp.deadlineOverride,
  };
}

export function guestPhoto(photo: EditorPhoto): Photo | null {
  if (!photo.src || (photo.status !== 'ready' && photo.status !== 'processing')) return null;
  return {
    id: photo.id,
    width: photo.width ?? 0,
    height: photo.height ?? 0,
    focal: photo.focal,
    src: { w800: photo.src.w800, w1200: photo.src.w1200, w1600: photo.src.w1600 },
    lqip: photo.lqip ?? '',
  };
}

function emptySide(relation: string): FamilySide {
  return { relation, father: emptyParent(), mother: emptyParent() };
}

function emptyParent(): ParentInput {
  return { name: '', phone: '', deceased: false, deceasedStyle: null };
}

function sideFrom(side: FamilySide): NonNullable<Invitation['families']['groom']> {
  return {
    relation: side.relation,
    father: parentFrom(side.father),
    mother: parentFrom(side.mother),
  };
}

function parentFrom(parent: ParentInput) {
  return {
    name: parent.name,
    phone: parent.phone || undefined,
    deceased: parent.deceased || undefined,
    deceasedStyle: parent.deceasedStyle ?? undefined,
  };
}
