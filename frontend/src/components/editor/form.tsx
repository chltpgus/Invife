'use client';

import { useState } from 'react';
import { formatKoreanTime, pad2 } from '@/domain/dates';
import {
  formatPhone,
  givenNameFromFull,
  GREETING_MAX,
  joinAddress,
  parentOf,
  resetDeadline,
  setCeremonyDate,
  setCoupleName,
  setDeadline,
  splitAddress,
  splitKst,
  type EditorDraft,
  type FieldIssue,
} from '@/domain/editor';
import { banks, greetingExamples } from '@/editor/themes';
import type { Account, Parent, Side } from '@/domain/types';
import { PhotoPanel } from '@/components/editor/photo-panel';
import { Field, Sheet, describedBy } from '@/components/editor/ui';

export function issueText(issues: FieldIssue[], id: string, reveal: boolean): string | null {
  const found = issues.find((issue) => issue.id === id);
  if (!found) return null;
  if (found.publish && !reveal) return null;
  return found.message;
}

function times(current?: string): string[] {
  const values: string[] = [];
  for (let hour = 0; hour < 24; hour += 1) {
    for (let minute = 0; minute < 60; minute += 10) values.push(`${pad2(hour)}:${pad2(minute)}`);
  }
  if (current && !values.includes(current)) values.unshift(current);
  return values;
}

export function CoverFields({ draft, issues, reveal, onChange }: FormBag) {
  const invitation = draft.invitation;
  const groomError = issueText(issues, 'groom-name', reveal);
  const brideError = issueText(issues, 'bride-name', reveal);
  const dateError = issueText(issues, 'ceremony-date', reveal);
  const timeError = issueText(issues, 'ceremony-time', reveal);
  const venueError = issueText(issues, 'venue', reveal);
  return (
    <>
      <Field id="groom-name" label="신랑 이름" required error={groomError} hint="2자에서 10자, 성을 포함해 주세요">
        <input id="groom-name" value={invitation.groom.name} maxLength={10} aria-invalid={Boolean(groomError)} aria-describedby={describedBy(groomError, 'groom-name')} onChange={(event) => onChange(setCoupleName(draft, 'groom', event.target.value))} />
      </Field>
      <Field id="bride-name" label="신부 이름" required error={brideError}>
        <input id="bride-name" value={invitation.bride.name} maxLength={10} aria-invalid={Boolean(brideError)} aria-describedby={describedBy(brideError, 'bride-name')} onChange={(event) => onChange(setCoupleName(draft, 'bride', event.target.value))} />
      </Field>
      <div className="ed-row">
        <Field id="groom.givenName" label="서명에 쓸 이름" required error={issueText(issues, 'groom.givenName', reveal)} hint="인사말 아래에 들어가요">
          <input id="groom.givenName" value={invitation.groom.givenName} maxLength={10} aria-invalid={Boolean(issueText(issues, 'groom.givenName', reveal))} onChange={(event) => onChange({ ...draft, invitation: { ...invitation, groom: { ...invitation.groom, givenName: event.target.value } } })} />
          <GivenSuggestion name={invitation.groom.name} givenName={invitation.groom.givenName} onUse={(givenName) => onChange({ ...draft, invitation: { ...invitation, groom: { ...invitation.groom, givenName } } })} />
        </Field>
        <Field id="bride.givenName" label="신부 서명 이름" required error={issueText(issues, 'bride.givenName', reveal)}>
          <input id="bride.givenName" value={invitation.bride.givenName} maxLength={10} aria-invalid={Boolean(issueText(issues, 'bride.givenName', reveal))} onChange={(event) => onChange({ ...draft, invitation: { ...invitation, bride: { ...invitation.bride, givenName: event.target.value } } })} />
          <GivenSuggestion name={invitation.bride.name} givenName={invitation.bride.givenName} onUse={(givenName) => onChange({ ...draft, invitation: { ...invitation, bride: { ...invitation.bride, givenName } } })} />
        </Field>
      </div>
      <div className="ed-row">
        <Field id="ceremony-date" label="예식 날짜" required error={dateError}>
          <input id="ceremony-date" type="date" value={invitation.ceremony.date} aria-invalid={Boolean(dateError)} aria-describedby={describedBy(dateError, 'ceremony-date')} onChange={(event) => onChange(setCeremonyDate(draft, event.target.value))} />
        </Field>
        <Field id="ceremony-time" label="예식 시간" required error={timeError}>
          <select id="ceremony-time" value={invitation.ceremony.time ?? ''} aria-invalid={Boolean(timeError)} aria-describedby={describedBy(timeError, 'ceremony-time')} onChange={(event) => onChange({ ...draft, invitation: { ...invitation, ceremony: { ...invitation.ceremony, time: event.target.value || undefined } } })}>
            <option value="">시간을 골라 주세요</option>
            {times(invitation.ceremony.time).map((time) => (
              <option key={time} value={time}>
                {formatKoreanTime(time)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field id="venue" label="예식장 이름" required error={venueError}>
        <input id="venue" value={invitation.ceremony.venueName} maxLength={30} aria-invalid={Boolean(venueError)} aria-describedby={describedBy(venueError, 'venue')} onChange={(event) => onChange({ ...draft, invitation: { ...invitation, ceremony: { ...invitation.ceremony, venueName: event.target.value } } })} />
      </Field>
      <Field id="hall" label="홀 이름" hint="비워 두면 예식장 이름만 보여요" error={issueText(issues, 'hall', true)}>
        <input id="hall" value={invitation.ceremony.hall ?? ''} maxLength={20} onChange={(event) => onChange({ ...draft, invitation: { ...invitation, ceremony: { ...invitation.ceremony, hall: event.target.value } } })} />
      </Field>
    </>
  );
}

export function GreetingFields({ draft, issues, onChange }: FormBag) {
  const [examples, setExamples] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const value = draft.invitation.greeting ?? '';
  const error = issueText(issues, 'greeting', true);
  return (
    <>
      <Field id="greeting" label="인사말" error={error} hint="비워 두면 인사말 섹션은 초대장에 보이지 않아요">
        <textarea id="greeting" value={value} maxLength={GREETING_MAX} aria-invalid={Boolean(error)} aria-describedby={describedBy(error, 'greeting')} onChange={(event) => onChange({ ...draft, invitation: { ...draft.invitation, greeting: event.target.value } })} />
      </Field>
      <p className={`ed-counter ${value.length >= GREETING_MAX ? 'is-error' : ''}`}>{value.length} / {GREETING_MAX}</p>
      <button type="button" className="ed-btn-secondary" onClick={() => setExamples(true)}>예시 문구 넣기</button>
      {examples ? (
        <Sheet title="예시 문구" onClose={() => setExamples(false)}>
          <div className="ed-stack">
            {greetingExamples.map((example) => (
              <button key={example.slice(0, 12)} type="button" className="ed-card" onClick={() => { setPending(example); setExamples(false); }}>
                {example}
              </button>
            ))}
          </div>
        </Sheet>
      ) : null}
      {pending !== null ? (
        <Sheet title="예시 문구로 바꿀까요?" onClose={() => setPending(null)}>
          <p>지금 적은 인사말을 덮어써요.</p>
          <div className="ed-inline">
            <button type="button" className="ed-btn" onClick={() => { onChange({ ...draft, invitation: { ...draft.invitation, greeting: pending } }); setPending(null); }}>바꾸기</button>
            <button type="button" className="ed-btn-secondary" onClick={() => setPending(null)}>취소</button>
          </div>
        </Sheet>
      ) : null}
    </>
  );
}

export function FamilyFields({ draft, issues, reveal, onChange }: FormBag) {
  return (
    <>
      <FamilySide draft={draft} side="groom" label="신랑측" issues={issues} reveal={reveal} onChange={onChange} />
      <FamilySide draft={draft} side="bride" label="신부측" issues={issues} reveal={reveal} onChange={onChange} />
      <p className="ed-hint">양쪽 이름을 모두 비우면 혼주 성함은 초대장에서 숨겨져요.</p>
    </>
  );
}

function FamilySide({ draft, side, label, issues, reveal, onChange }: FormBag & { side: Side; label: string }) {
  const family = draft.invitation.families[side];
  const relation = family?.relation ?? (side === 'groom' ? '아들' : '딸');
  return (
    <div className="ed-card">
      <p className="ed-label">{label}</p>
      <Field id={`${side}-relation`} label="관계 표기" hint="아들, 딸, 장남, 차녀">
        <input id={`${side}-relation`} value={relation} maxLength={6} onChange={(event) => onChange(setRelation(draft, side, event.target.value))} />
      </Field>
      <ParentFields draft={draft} side={side} slot="father" label="아버지" issues={issues} reveal={reveal} onChange={onChange} />
      <ParentFields draft={draft} side={side} slot="mother" label="어머니" issues={issues} reveal={reveal} onChange={onChange} />
    </div>
  );
}

function ParentFields({
  draft,
  side,
  slot,
  label,
  issues,
  reveal,
  onChange,
}: FormBag & { side: Side; slot: 'father' | 'mother'; label: string }) {
  const parent = parentOf(draft.invitation, side, slot);
  const styleError = issueText(issues, `${side}-${slot}-style`, reveal);
  return (
    <>
      <Field id={`${side}-${slot}-name`} label={`${label} 이름`} hint="비워 두면 그 이름은 빠져요">
        <input id={`${side}-${slot}-name`} value={parent.name} maxLength={10} onChange={(event) => onChange(setParent(draft, side, slot, { ...parent, name: event.target.value }))} />
      </Field>
      <label className="ed-check">
        <input type="checkbox" checked={Boolean(parent.deceased)} onChange={(event) => onChange(setParent(draft, side, slot, { ...parent, deceased: event.target.checked }))} />
        고인
      </label>
      {parent.deceased ? (
        <fieldset>
          <legend className="ed-label">고인 표기</legend>
          <div className="ed-radios" role="radiogroup" aria-label={`${label} 고인 표기`}>
            <label className="ed-check">
              <input type="radio" name={`${side}-${slot}-style`} checked={parent.deceasedStyle === 'hanja'} onChange={() => onChange(setParent(draft, side, slot, { ...parent, deceased: true, deceasedStyle: 'hanja' }))} />
              故 {parent.name || label}
            </label>
            <label className="ed-check">
              <input type="radio" name={`${side}-${slot}-style`} checked={parent.deceasedStyle === 'hangul'} onChange={() => onChange(setParent(draft, side, slot, { ...parent, deceased: true, deceasedStyle: 'hangul' }))} />
              고 {parent.name || label}
            </label>
          </div>
          {styleError ? <p className="ed-error" role="alert">{styleError}</p> : <p className="ed-hint">고인으로 표시하면 연락하기에서 이 분의 연락처는 보이지 않아요</p>}
        </fieldset>
      ) : null}
    </>
  );
}

export function ContactFields({ draft, issues, onChange }: FormBag) {
  const rows: Array<{ id: string; label: string; value: string | undefined; disabled: boolean; set: (phone: string) => EditorDraft }> = [
    { id: 'groom.phone', label: draft.invitation.groom.name.trim() || '신랑', value: draft.invitation.groom.phone, disabled: false, set: (phone) => ({ ...draft, invitation: { ...draft.invitation, groom: { ...draft.invitation.groom, phone } } }) },
    { id: 'bride.phone', label: draft.invitation.bride.name.trim() || '신부', value: draft.invitation.bride.phone, disabled: false, set: (phone) => ({ ...draft, invitation: { ...draft.invitation, bride: { ...draft.invitation.bride, phone } } }) },
    ...parentPhones(draft),
  ];
  return (
    <>
      {rows.map((row) => {
        const error = issueText(issues, row.id, true);
        return (
          <Field key={row.id} id={row.id} label={row.label} error={error} hint={row.disabled ? '고인으로 표시돼 연락하기에서 숨겨져요' : undefined}>
            <input id={row.id} inputMode="tel" disabled={row.disabled} value={row.disabled ? '' : (row.value ?? '')} aria-invalid={Boolean(error)} aria-describedby={describedBy(error, row.id)} onChange={(event) => onChange(row.set(formatPhone(event.target.value)))} />
          </Field>
        );
      })}
      <p className="ed-hint">입력한 번호는 초대장을 받은 누구나 볼 수 있어요. 모두 비우면 연락하기는 숨겨져요.</p>
    </>
  );
}

export function WhenNote() {
  return <p className="ed-hint">커버의 날짜로 자동으로 만들어져요.</p>;
}

export function DirectionFields({ draft, issues, reveal, onChange }: FormBag) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(splitAddress(draft.invitation.ceremony.address).road);
  const address = splitAddress(draft.invitation.ceremony.address);
  const error = issueText(issues, 'address', reveal);
  const detailError = issueText(issues, 'address-detail', true);
  const transport = draft.invitation.transport ?? {};
  return (
    <>
      <Field id="address" label="주소" required error={error} hint="좌표 변환은 주소 검색 API가 연결되면 지도에 표시돼요. 지금은 주소만 초대장에 나와요.">
        <input id="address" readOnly value={address.road} aria-invalid={Boolean(error)} aria-describedby={describedBy(error, 'address')} onClick={() => setOpen(true)} />
      </Field>
      <button type="button" className="ed-btn-secondary" onClick={() => setOpen(true)}>주소 검색</button>
      <Field id="address-detail" label="상세 주소" error={detailError} hint="비워 두면 생략돼요">
        <input id="address-detail" value={address.detail} maxLength={40} onChange={(event) => onChange(setAddress(draft, address.road, event.target.value))} />
      </Field>
      <TransportField id="parking" label="주차" value={transport.parking ?? ''} error={issueText(issues, 'parking', true)} onChange={(value) => onChange(setTransport(draft, 'parking', value))} />
      <TransportField id="subway" label="지하철" value={transport.subway ?? ''} error={issueText(issues, 'subway', true)} onChange={(value) => onChange(setTransport(draft, 'subway', value))} />
      <TransportField id="bus" label="버스" value={transport.bus ?? ''} error={issueText(issues, 'bus', true)} onChange={(value) => onChange(setTransport(draft, 'bus', value))} />
      <TransportField id="other" label="기타 안내" value={transport.other ?? ''} error={issueText(issues, 'other', true)} onChange={(value) => onChange(setTransport(draft, 'other', value))} />
      <p className="ed-hint">교통 안내를 모두 비우면 그 블록은 숨겨져요.</p>
      {open ? (
        <Sheet title="주소 검색" onClose={() => setOpen(false)}>
          <Field id="address-query" label="도로명 주소">
            <input id="address-query" value={query} onChange={(event) => setQuery(event.target.value)} />
          </Field>
          <p className="ed-hint">지도에서 위치를 찾지 못해도 주소는 그대로 초대장에 보여요.</p>
          <button type="button" className="ed-btn" onClick={() => { onChange(setAddress(draft, query, address.detail)); setOpen(false); }}>이 주소 사용</button>
        </Sheet>
      ) : null}
    </>
  );
}

export function AccountFields({ draft, issues, onChange, onMessage }: FormBag & { onMessage: (text: string) => void }) {
  const [undo, setUndo] = useState<{ account: Account; index: number } | null>(null);
  const noteError = (draft.invitation.accountsNote ?? '').length > 80 ? '안내는 80자까지 입력할 수 있어요' : null;
  function add(side: Side) {
    const count = draft.invitation.accounts.filter((account) => account.side === side).length;
    if (count >= 3) return;
    const account: Account = { id: crypto.randomUUID(), side, relation: '본인', holder: '', bank: '', number: '' };
    onChange({ ...draft, invitation: { ...draft.invitation, accounts: [...draft.invitation.accounts, account] } });
  }
  function remove(account: Account) {
    const index = draft.invitation.accounts.findIndex((item) => item.id === account.id);
    onChange({ ...draft, invitation: { ...draft.invitation, accounts: draft.invitation.accounts.filter((item) => item.id !== account.id) } });
    setUndo({ account, index });
    window.setTimeout(() => setUndo((current) => (current?.account.id === account.id ? null : current)), 5000);
    onMessage('삭제했어요');
  }
  return (
    <>
      <SideAccounts side="groom" title="신랑측" draft={draft} issues={issues} onChange={onChange} onAdd={() => add('groom')} onRemove={remove} />
      <SideAccounts side="bride" title="신부측" draft={draft} issues={issues} onChange={onChange} onAdd={() => add('bride')} onRemove={remove} />
      <Field id="accounts-note" label="안내 문구" error={noteError} hint="비워 두면 생략돼요">
        <textarea id="accounts-note" value={draft.invitation.accountsNote ?? ''} maxLength={80} onChange={(event) => onChange({ ...draft, invitation: { ...draft.invitation, accountsNote: event.target.value } })} />
      </Field>
      {undo ? (
        <button type="button" className="ed-btn-text" onClick={() => {
          const next = draft.invitation.accounts.slice();
          next.splice(undo.index, 0, undo.account);
          onChange({ ...draft, invitation: { ...draft.invitation, accounts: next } });
          setUndo(null);
        }}>
          되돌리기
        </button>
      ) : null}
      <p className="ed-hint">한쪽을 비우면 그 아코디언은 숨겨지고, 양쪽을 비우면 마음 전하실 곳 전체가 숨겨져요.</p>
      <datalist id="bank-list">
        {banks.map((bank) => (
          <option key={bank} value={bank} />
        ))}
      </datalist>
    </>
  );
}

export function RsvpFields({ draft, issues, onChange }: FormBag) {
  const parts = splitKst(draft.invitation.rsvp.deadline);
  const error = issueText(issues, 'deadline', true);
  const dateReady = /^\d{4}-\d{2}-\d{2}$/.test(draft.invitation.ceremony.date);
  return (
    <>
      <p className="ed-hint">마감은 항상 있어요. 기본은 예식 전날 23:59예요.</p>
      <div className="ed-row">
        <Field id="deadline-date" label="응답 마감 날짜" error={error}>
          <input id="deadline-date" type="date" disabled={!dateReady} value={parts?.date ?? ''} aria-invalid={Boolean(error)} onChange={(event) => onChange(setDeadline(draft, event.target.value, parts?.time ?? '23:59'))} />
        </Field>
        <Field id="deadline-time" label="응답 마감 시간">
          <input id="deadline-time" type="time" step={60} disabled={!dateReady} value={parts?.time ?? ''} onChange={(event) => onChange(setDeadline(draft, parts?.date ?? draft.invitation.ceremony.date, event.target.value))} />
        </Field>
      </div>
      <button type="button" className="ed-btn-secondary" disabled={!dateReady} onClick={() => onChange(resetDeadline(draft))}>예식 전날 밤 12시</button>
      <p className="ed-hint">하객은 마감 전까지 응답을 고칠 수 있어요. 본인 제외 최대 10명까지 받아요.</p>
      <p className="ed-hint">공용 RSVP 링크는 발행하면 만들어져요.</p>
    </>
  );
}

export function GalleryFields({
  draft,
  onChange,
  onMessage,
  uploadFile,
  removePhoto,
}: FormBag & {
  onMessage: (text: string) => void;
  uploadFile: (file: File) => Promise<{ photo: import('@/domain/types').Photo } | { error: string }>;
  removePhoto: (id: string) => Promise<boolean>;
}) {
  return (
    <PhotoPanel
      photos={draft.invitation.photos}
      tone={draft.photoTone}
      onPhotos={(photos) => onChange({ ...draft, invitation: { ...draft.invitation, photos } })}
      onTone={(photoTone) => onChange({
        ...draft,
        photoTone,
        photoAdjust: Object.fromEntries(draft.invitation.photos.map((photo) => [photo.id, { crop: draft.photoAdjust[photo.id]?.crop ?? { x: 0, y: 0, width: 1, height: 1 }, filter: photoTone }])),
      })}
      onMessage={onMessage}
      uploadFile={uploadFile}
      removePhoto={removePhoto}
    />
  );
}

function GivenSuggestion({ name, givenName, onUse }: { name: string; givenName: string; onUse: (value: string) => void }) {
  const suggestion = givenNameFromFull(name);
  if (givenName.trim() || !suggestion || suggestion === name.trim()) return null;
  return (
    <button type="button" className="ed-btn-text" onClick={() => onUse(suggestion)}>
      제안 {suggestion} 사용
    </button>
  );
}

type FormBag = {
  draft: EditorDraft;
  issues: FieldIssue[];
  reveal: boolean;
  onChange: (draft: EditorDraft) => void;
};

function setRelation(draft: EditorDraft, side: Side, relation: string): EditorDraft {
  const family = draft.invitation.families[side] ?? { relation };
  return { ...draft, invitation: { ...draft.invitation, families: { ...draft.invitation.families, [side]: { ...family, relation } } } };
}

function setParent(draft: EditorDraft, side: Side, slot: 'father' | 'mother', parent: Parent): EditorDraft {
  const family = draft.invitation.families[side] ?? { relation: side === 'groom' ? '아들' : '딸' };
  return { ...draft, invitation: { ...draft.invitation, families: { ...draft.invitation.families, [side]: { ...family, [slot]: parent } } } };
}

function parentPhones(draft: EditorDraft): Array<{ id: string; label: string; value: string | undefined; disabled: boolean; set: (phone: string) => EditorDraft }> {
  const slots = [
    ['groom', 'father', '신랑 아버지'],
    ['groom', 'mother', '신랑 어머니'],
    ['bride', 'father', '신부 아버지'],
    ['bride', 'mother', '신부 어머니'],
  ] as const;
  return slots.map(([side, slot, fallback]) => {
    const parent = parentOf(draft.invitation, side, slot);
    return {
      id: `families.${side}.${slot}.phone`,
      label: parent.name.trim() || fallback,
      value: parent.phone,
      disabled: Boolean(parent.deceased),
      set: (phone: string) => setParent(draft, side, slot, { ...parentOf(draft.invitation, side, slot), phone }),
    };
  });
}

function setAddress(draft: EditorDraft, road: string, detail: string): EditorDraft {
  return { ...draft, invitation: { ...draft.invitation, ceremony: { ...draft.invitation.ceremony, address: joinAddress(road, detail) } } };
}

function setTransport(draft: EditorDraft, key: 'parking' | 'subway' | 'bus' | 'other', value: string): EditorDraft {
  return { ...draft, invitation: { ...draft.invitation, transport: { ...draft.invitation.transport, [key]: value } } };
}

function TransportField({ id, label, value, error, onChange }: { id: string; label: string; value: string; error: string | null; onChange: (value: string) => void }) {
  return (
    <Field id={id} label={label} error={error} hint="비워 두면 그 항목은 숨겨져요">
      <textarea id={id} value={value} maxLength={100} aria-invalid={Boolean(error)} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

function SideAccounts({
  side,
  title,
  draft,
  issues,
  onChange,
  onAdd,
  onRemove,
}: {
  side: Side;
  title: string;
  draft: EditorDraft;
  issues: FieldIssue[];
  onChange: (draft: EditorDraft) => void;
  onAdd: () => void;
  onRemove: (account: Account) => void;
}) {
  const accounts = draft.invitation.accounts.filter((account) => account.side === side);
  return (
    <div className="ed-card">
      <p className="ed-label">{title}</p>
      {accounts.map((account, index) => (
        <AccountRow key={account.id} account={account} index={index} total={accounts.length} issues={issues} onChange={(next) => onChange(replaceAccount(draft, next))} onRemove={() => onRemove(account)} onMove={(to) => onChange(moveAccount(draft, account.id, to))} />
      ))}
      <button type="button" className="ed-btn-secondary" disabled={accounts.length >= 3} onClick={onAdd}>계좌 추가</button>
    </div>
  );
}

function AccountRow({
  account,
  index,
  total,
  issues,
  onChange,
  onRemove,
  onMove,
}: {
  account: Account;
  index: number;
  total: number;
  issues: FieldIssue[];
  onChange: (account: Account) => void;
  onRemove: () => void;
  onMove: (to: number) => void;
}) {
  const error = issues.find((issue) => issue.id === 'accounts.number' || issue.id === `accounts.${account.id}.number` || issue.id === `accounts.${account.id}.holder`)?.message ?? null;
  const custom = !['본인', '아버지', '어머니'].includes(account.relation);
  return (
    <div className="ed-account">
      <Field id={`account-${account.id}-relation`} label="관계">
        <select id={`account-${account.id}-relation`} value={custom ? 'custom' : account.relation} onChange={(event) => onChange({ ...account, relation: event.target.value === 'custom' ? '' : event.target.value })}>
          <option value="본인">본인</option>
          <option value="아버지">아버지</option>
          <option value="어머니">어머니</option>
          <option value="custom">직접 입력</option>
        </select>
      </Field>
      {custom ? <input aria-label="관계 직접 입력" value={account.relation} maxLength={10} onChange={(event) => onChange({ ...account, relation: event.target.value })} /> : null}
      <Field id={`account-${account.id}-holder`} label="예금주" error={error}>
        <input id={`account-${account.id}-holder`} value={account.holder} maxLength={20} onChange={(event) => onChange({ ...account, holder: event.target.value })} />
      </Field>
      <Field id={`account-${account.id}-bank`} label="은행">
        <input id={`account-${account.id}-bank`} list="bank-list" value={account.bank} onChange={(event) => onChange({ ...account, bank: event.target.value })} />
      </Field>
      <Field id={`account-${account.id}-number`} label="계좌번호">
        <input id={`account-${account.id}-number`} inputMode="numeric" value={account.number} onChange={(event) => onChange({ ...account, number: event.target.value.replace(/[^\d-]/g, '').slice(0, 20) })} />
      </Field>
      <div className="ed-inline">
        <button type="button" className="ed-btn-secondary" disabled={index === 0} onClick={() => onMove(index - 1)}>위로</button>
        <button type="button" className="ed-btn-secondary" disabled={index === total - 1} onClick={() => onMove(index + 1)}>아래로</button>
        <button type="button" className="ed-btn-text" onClick={onRemove}>삭제</button>
      </div>
    </div>
  );
}

function replaceAccount(draft: EditorDraft, account: Account): EditorDraft {
  return { ...draft, invitation: { ...draft.invitation, accounts: draft.invitation.accounts.map((item) => (item.id === account.id ? account : item)) } };
}

function moveAccount(draft: EditorDraft, id: string, toIndexOnSide: number): EditorDraft {
  const side = draft.invitation.accounts.find((account) => account.id === id)?.side;
  if (!side) return draft;
  const sideItems = draft.invitation.accounts.filter((account) => account.side === side);
  const from = sideItems.findIndex((account) => account.id === id);
  if (from < 0 || toIndexOnSide < 0 || toIndexOnSide >= sideItems.length) return draft;
  const reordered = sideItems.slice();
  const [item] = reordered.splice(from, 1);
  if (!item) return draft;
  reordered.splice(toIndexOnSide, 0, item);
  const others = draft.invitation.accounts.filter((account) => account.side !== side);
  const accounts = side === 'groom' ? [...reordered, ...others] : [...others, ...reordered];
  return { ...draft, invitation: { ...draft.invitation, accounts } };
}
