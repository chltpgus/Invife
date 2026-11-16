'use client';

import { eyebrows } from '@/content/copy';
import { Icon } from '@/components/icon';
import { copyText, useToast } from '@/components/toast';
import type { Account, Side } from '@/domain/types';
import { accountCopyValue, accountsBySide } from '@/domain/visibility';

export function Accounts({
  note,
  accounts,
  open,
  onToggle,
}: {
  note?: string;
  accounts: Account[];
  open: Record<Side, boolean>;
  onToggle: (side: Side) => void;
}) {
  const notify = useToast();
  const grouped = accountsBySide(accounts);
  if (accounts.length === 0) return null;
  return (
    <section className="section" id="accounts" aria-labelledby="accounts-title">
      <p className="eyebrow" aria-hidden="true">
        {eyebrows.accounts}
      </p>
      <h2 id="accounts-title" className="heading">
        마음 전하실 곳
      </h2>
      {note?.trim() ? <p className="text-2">{note}</p> : null}
      <SideAccordion side="groom" title="신랑측 계좌" accounts={grouped.groom} open={open.groom} onToggle={() => onToggle('groom')} notify={notify} />
      <SideAccordion side="bride" title="신부측 계좌" accounts={grouped.bride} open={open.bride} onToggle={() => onToggle('bride')} notify={notify} />
    </section>
  );
}

function SideAccordion({
  side,
  title,
  accounts,
  open,
  onToggle,
  notify,
}: {
  side: Side;
  title: string;
  accounts: Account[];
  open: boolean;
  onToggle: () => void;
  notify: (text: string, tone?: 'ok' | 'err') => void;
}) {
  if (accounts.length === 0) return null;
  const panelId = `accounts-${side}-panel`;
  return (
    <div className={`accordion ${open ? 'is-open' : ''}`}>
      <button type="button" className="accordion-head" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
        <span className="label-text">{title}</span>
        <Icon name="chevron-down" />
      </button>
      <div id={panelId} className="accordion-panel" role="region">
        <div>
          <ul>
            {accounts.map((account) => (
              <li key={account.id} className="account-row">
                <div>
                  <p className="caption">
                    {account.relation} {account.holder}
                  </p>
                  <p className="nums">
                    {account.bank} {account.number}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void copyText(accountCopyValue(account), '계좌번호를 복사했어요', notify)}
                >
                  <Icon name="copy" size={18} />
                  복사
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
