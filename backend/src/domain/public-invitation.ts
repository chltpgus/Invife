export type PublicInvitation = {
  id: string;
  slug: string;
  theme: 'ivory' | 'sage' | 'mist';
  groom: { name: string; givenName: string; phone?: string };
  bride: { name: string; givenName: string; phone?: string };
  ceremony: {
    date: string;
    time?: string;
    venueName: string;
    hall?: string;
    address?: string;
    lat?: number;
    lng?: number;
  };
  greeting?: string;
  families: {
    groom?: FamilySide;
    bride?: FamilySide;
  };
  photos: PublicPhoto[];
  transport?: { parking?: string; subway?: string; bus?: string; other?: string };
  accountsNote?: string;
  accounts: PublicAccount[];
  rsvp: { deadline: string };
};

type FamilySide = {
  relation: string;
  father?: Parent;
  mother?: Parent;
};

type Parent = {
  name: string;
  phone?: string;
  deceased?: boolean;
  deceasedStyle?: 'hanja' | 'hangul';
};

type PublicPhoto = {
  id: string;
  width: number;
  height: number;
  focal: { x: number; y: number };
  src: { w800: string; w1200: string; w1600: string };
  lqip: string;
};

type PublicAccount = {
  id: string;
  side: 'groom' | 'bride';
  relation: string;
  holder: string;
  bank: string;
  number: string;
};

export type WorkingInvitation = {
  id: string;
  slug: string;
  theme: 'ivory' | 'sage' | 'mist';
  groomName: string;
  groomGivenName: string;
  groomPhone: string;
  brideName: string;
  brideGivenName: string;
  bridePhone: string;
  groomRelation: string;
  brideRelation: string;
  ceremonyDate: string | null;
  ceremonyTime: string | null;
  venueName: string;
  hall: string;
  address: string;
  addressDetail: string;
  lat: number | null;
  lng: number | null;
  greeting: string;
  transportParking: string;
  transportSubway: string;
  transportBus: string;
  transportOther: string;
  accountsNote: string;
  families: ParentRow[];
  photos: PhotoRow[];
  accounts: AccountRow[];
};

export type ParentRow = {
  side: 'groom' | 'bride';
  role: 'father' | 'mother';
  name: string;
  phone: string;
  deceased: boolean;
  deceasedStyle: 'hanja' | 'hangul' | null;
};

export type PhotoRow = {
  id: string;
  sort: number;
  status: string;
  width: number | null;
  height: number | null;
  focalX: number;
  focalY: number;
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
  filter: 'original' | 'warm' | 'mono';
  lqip: string | null;
};

export type AccountRow = {
  id: string;
  side: 'groom' | 'bride';
  sort: number;
  relation: string;
  holder: string;
  bank: string;
  number: string;
};

export function photoKey(invitationId: string, photoId: string, name: string): string {
  return `inv/${invitationId}/${photoId}/${name}`;
}

export function buildPublicInvitation(input: WorkingInvitation, deadline: string): PublicInvitation {
  const photos = input.photos
    .filter((photo) => photo.status === 'ready' && photo.width && photo.height && photo.lqip)
    .sort((a, b) => a.sort - b.sort)
    .map((photo) => ({
      id: photo.id,
      width: photo.width ?? 0,
      height: photo.height ?? 0,
      focal: { x: photo.focalX, y: photo.focalY },
      src: {
        w800: photoKey(input.id, photo.id, 'w800.webp'),
        w1200: photoKey(input.id, photo.id, 'w1200.webp'),
        w1600: photoKey(input.id, photo.id, 'w1600.webp'),
      },
      lqip: photo.lqip ?? '',
    }));

  const address = [input.address.trim(), input.addressDetail.trim()].filter(Boolean).join(' ');
  const ceremony: PublicInvitation['ceremony'] = {
    date: input.ceremonyDate ?? '',
    venueName: input.venueName.trim(),
  };
  if (input.ceremonyTime) ceremony.time = input.ceremonyTime;
  if (input.hall.trim()) ceremony.hall = input.hall.trim();
  if (address) ceremony.address = address;
  if (input.lat !== null) ceremony.lat = input.lat;
  if (input.lng !== null) ceremony.lng = input.lng;

  const transport: NonNullable<PublicInvitation['transport']> = {};
  if (input.transportParking.trim()) transport.parking = input.transportParking.trim();
  if (input.transportSubway.trim()) transport.subway = input.transportSubway.trim();
  if (input.transportBus.trim()) transport.bus = input.transportBus.trim();
  if (input.transportOther.trim()) transport.other = input.transportOther.trim();

  const invitation: PublicInvitation = {
    id: input.id,
    slug: input.slug,
    theme: input.theme,
    groom: person(input.groomName, input.groomGivenName, input.groomPhone),
    bride: person(input.brideName, input.brideGivenName, input.bridePhone),
    ceremony,
    families: {},
    photos,
    accounts: input.accounts
      .filter((account) => account.holder.trim() && account.bank.trim() && account.number.trim())
      .sort((a, b) => a.sort - b.sort)
      .map((account) => ({
        id: account.id,
        side: account.side,
        relation: account.relation.trim(),
        holder: account.holder.trim(),
        bank: account.bank.trim(),
        number: account.number.trim(),
      })),
    rsvp: { deadline },
  };

  const groom = familySide('groom', input.groomRelation, input.families.filter((row) => row.side === 'groom'));
  const bride = familySide('bride', input.brideRelation, input.families.filter((row) => row.side === 'bride'));
  if (groom) invitation.families.groom = groom;
  if (bride) invitation.families.bride = bride;
  if (input.greeting.trim()) invitation.greeting = input.greeting;
  if (Object.keys(transport).length) invitation.transport = transport;
  if (input.accountsNote.trim()) invitation.accountsNote = input.accountsNote.trim();
  return invitation;
}

function person(name: string, givenName: string, phone: string): { name: string; givenName: string; phone?: string } {
  const personValue: { name: string; givenName: string; phone?: string } = {
    name: name.trim(),
    givenName: givenName.trim(),
  };
  if (phone.trim()) personValue.phone = phone.trim();
  return personValue;
}

function familySide(sideName: 'groom' | 'bride', relation: string, rows: ParentRow[]): FamilySide | undefined {
  const father = parentOf(rows.find((row) => row.role === 'father'));
  const mother = parentOf(rows.find((row) => row.role === 'mother'));
  if (!father && !mother) return undefined;
  const side: FamilySide = { relation: relation.trim() || (sideName === 'bride' ? '딸' : '아들') };
  if (father) side.father = father;
  if (mother) side.mother = mother;
  return side;
}

function parentOf(row: ParentRow | undefined): Parent | undefined {
  if (!row || !row.name.trim()) return undefined;
  const parent: Parent = { name: row.name.trim() };
  if (row.deceased) {
    parent.deceased = true;
    if (row.deceasedStyle) parent.deceasedStyle = row.deceasedStyle;
    return parent;
  }
  if (row.phone.trim()) parent.phone = row.phone.trim();
  return parent;
}
