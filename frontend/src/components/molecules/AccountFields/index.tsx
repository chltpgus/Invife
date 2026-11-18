'use client';

import { useState } from 'react';
import { banks } from '@/editor/themes';
import type { Account, Side } from '@/domain/types';
import Field from '@/components/atoms/Field';
import { SideAccounts, type FormBag } from '@/components/molecules/editorForm/shared';

interface AccountFieldsProps extends FormBag {
  onMessage: (text: string) => void;
}

const AccountFields = ({ draft, issues, onChange, onMessage }: AccountFieldsProps) => {
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

export default AccountFields;
