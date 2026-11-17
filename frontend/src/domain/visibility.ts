import type { Account, FamilySide, Invitation, Parent, Side, Transport } from '@/domain/types';

export function deceasedPrefix(style: Parent['deceasedStyle']): '故' | '고' {
  return style === 'hangul' ? '고' : '故';
}

export function namedParents(side: FamilySide | undefined): Parent[] {
  if (!side) return [];
  return [side.father, side.mother].filter((parent): parent is Parent => Boolean(parent?.name.trim()));
}

export function parentLineText(side: FamilySide | undefined, givenName: string): string | null {
  if (!side?.relation.trim()) return null;
  const parents = namedParents(side);
  if (parents.length === 0) return null;
  const names = parents
    .map((parent) => (parent.deceased ? `${deceasedPrefix(parent.deceasedStyle)} ${parent.name}` : parent.name))
    .join(' · ');
  return `${names} 의 ${side.relation} ${givenName}`;
}

export type ContactRow = {
  id: string;
  side: Side;
  relation: string;
  name: string;
  phone: string;
};

function phoneOf(phone: string | undefined): string | null {
  const value = phone?.trim();
  return value ? value : null;
}

function addContact(
  rows: ContactRow[],
  id: string,
  side: Side,
  relation: string,
  name: string,
  phone: string | undefined,
  deceased = false,
) {
  const value = phoneOf(phone);
  if (deceased || !value || !name.trim()) return;
  rows.push({ id, side, relation, name, phone: value });
}

/** 고인이거나 번호가 없는 사람은 행 자체를 넣지 않는다. */
export function contactRows(invitation: Invitation): ContactRow[] {
  const rows: ContactRow[] = [];
  addContact(rows, 'groom', 'groom', '신랑', invitation.groom.name, invitation.groom.phone);
  const groom = invitation.families.groom;
  addContact(rows, 'groom-father', 'groom', '아버지', groom?.father?.name ?? '', groom?.father?.phone, groom?.father?.deceased);
  addContact(rows, 'groom-mother', 'groom', '어머니', groom?.mother?.name ?? '', groom?.mother?.phone, groom?.mother?.deceased);
  addContact(rows, 'bride', 'bride', '신부', invitation.bride.name, invitation.bride.phone);
  const bride = invitation.families.bride;
  addContact(rows, 'bride-father', 'bride', '아버지', bride?.father?.name ?? '', bride?.father?.phone, bride?.father?.deceased);
  addContact(rows, 'bride-mother', 'bride', '어머니', bride?.mother?.name ?? '', bride?.mother?.phone, bride?.mother?.deceased);
  return rows;
}

export function contactsBySide(invitation: Invitation): { groom: ContactRow[]; bride: ContactRow[] } {
  const rows = contactRows(invitation);
  return {
    groom: rows.filter((row) => row.side === 'groom'),
    bride: rows.filter((row) => row.side === 'bride'),
  };
}

export function hasTransport(transport: Transport | undefined): boolean {
  if (!transport) return false;
  return [transport.parking, transport.subway, transport.bus, transport.other].some((item) => item?.trim());
}

export function accountsBySide(accounts: Account[]): { groom: Account[]; bride: Account[] } {
  return {
    groom: accounts.filter((account) => account.side === 'groom'),
    bride: accounts.filter((account) => account.side === 'bride'),
  };
}

export type SectionFlags = {
  greeting: boolean;
  parents: boolean;
  contact: boolean;
  gallery: boolean;
  directions: boolean;
  transport: boolean;
  map: boolean;
  accounts: boolean;
};

export function sectionFlags(invitation: Invitation): SectionFlags {
  const parents =
    parentLineText(invitation.families.groom, invitation.groom.givenName) !== null ||
    parentLineText(invitation.families.bride, invitation.bride.givenName) !== null;
  return {
    greeting: Boolean(invitation.greeting?.trim()),
    parents,
    contact: contactRows(invitation).length > 0,
    gallery: invitation.photos.length > 0,
    directions: Boolean(invitation.ceremony.venueName.trim() || invitation.ceremony.address?.trim()),
    transport: hasTransport(invitation.transport),
    map: invitation.ceremony.lat !== undefined && invitation.ceremony.lng !== undefined,
    accounts: invitation.accounts.length > 0,
  };
}

export function venueLine(invitation: Invitation): string {
  const hall = invitation.ceremony.hall?.trim();
  return hall ? `${invitation.ceremony.venueName} ${hall}` : invitation.ceremony.venueName;
}

export function accountCopyValue(account: Account): string {
  return `${account.bank} ${account.number}`;
}

export function telHref(phone: string): string {
  const compact = phone.replace(/[^\d+]/g, '');
  return `tel:${compact}`;
}

export function smsHref(phone: string): string {
  return `sms:${phone.replace(/[^\d+]/g, '')}`;
}
