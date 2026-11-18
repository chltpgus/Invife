'use client';

import { pad2 } from '@/domain/dates';
import { givenNameFromFull, joinAddress, parentOf, type EditorDraft, type FieldIssue } from '@/domain/editor';
import type { Account, Parent, Side } from '@/domain/types';
import Field from '@/components/atoms/Field';

export type FormBag = {
  draft: EditorDraft;
  issues: FieldIssue[];
  reveal: boolean;
  onChange: (draft: EditorDraft) => void;
};

export function issueText(issues: FieldIssue[], id: string, reveal: boolean): string | null {
  const found = issues.find((issue) => issue.id === id);
  if (!found) return null;
  if (found.publish && !reveal) return null;
  return found.message;
}

export function times(current?: string): string[] {
  const values: string[] = [];
  for (let hour = 0; hour < 24; hour += 1) {
    for (let minute = 0; minute < 60; minute += 10) values.push(`${pad2(hour)}:${pad2(minute)}`);
  }
  if (current && !values.includes(current)) values.unshift(current);
  return values;
}

export function GivenSuggestion({ name, givenName, onUse }: { name: string; givenName: string; onUse: (value: string) => void }) {
  const suggestion = givenNameFromFull(name);
  if (givenName.trim() || !suggestion || suggestion === name.trim()) return null;
  return (
    <button type="button" className="ed-btn-text" onClick={() => onUse(suggestion)}>
      제안 {suggestion} 사용
    </button>
  );
}

export function setRelation(draft: EditorDraft, side: Side, relation: string): EditorDraft {
  const family = draft.invitation.families[side] ?? { relation };
  return { ...draft, invitation: { ...draft.invitation, families: { ...draft.invitation.families, [side]: { ...family, relation } } } };
}

export function setParent(draft: EditorDraft, side: Side, slot: 'father' | 'mother', parent: Parent): EditorDraft {
  const family = draft.invitation.families[side] ?? { relation: side === 'groom' ? '아들' : '딸' };
  return { ...draft, invitation: { ...draft.invitation, families: { ...draft.invitation.families, [side]: { ...family, [slot]: parent } } } };
}

export function parentPhones(draft: EditorDraft): Array<{ id: string; label: string; value: string | undefined; disabled: boolean; set: (phone: string) => EditorDraft }> {
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

export function setAddress(draft: EditorDraft, road: string, detail: string): EditorDraft {
  return { ...draft, invitation: { ...draft.invitation, ceremony: { ...draft.invitation.ceremony, address: joinAddress(road, detail) } } };
}

export function setTransport(draft: EditorDraft, key: 'parking' | 'subway' | 'bus' | 'other', value: string): EditorDraft {
  return { ...draft, invitation: { ...draft.invitation, transport: { ...draft.invitation.transport, [key]: value } } };
}

export function TransportField({ id, label, value, error, onChange }: { id: string; label: string; value: string; error: string | null; onChange: (value: string) => void }) {
  return (
    <Field id={id} label={label} error={error} hint="비워 두면 그 항목은 숨겨져요">
      <textarea id={id} value={value} maxLength={100} aria-invalid={Boolean(error)} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

export function SideAccounts({
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

export function AccountRow({
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

export function replaceAccount(draft: EditorDraft, account: Account): EditorDraft {
  return { ...draft, invitation: { ...draft.invitation, accounts: draft.invitation.accounts.map((item) => (item.id === account.id ? account : item)) } };
}

export function moveAccount(draft: EditorDraft, id: string, toIndexOnSide: number): EditorDraft {
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
