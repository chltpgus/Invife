'use client';
import Phone from '@/components/atoms/svg/Phone';
import Message from '@/components/atoms/svg/Message';
import Copy from '@/components/atoms/svg/Copy';
import { eyebrows } from '@/content/copy';
import Reveal from '@/components/atoms/Reveal';
import { copyText, useToast } from '@/components/molecules/Toast';
import type { Invitation, Parent } from '@/domain/types';
import {
  contactsBySide,
  deceasedPrefix,
  namedParents,
  smsHref,
  telHref,
  type ContactRow,
} from '@/domain/visibility';

function PersonName({ person }: { person: Parent }) {
  if (!person.deceased) return <>{person.name}</>;
  const prefix = deceasedPrefix(person.deceasedStyle);
  return (
    <span aria-label={`고 ${person.name}`}>
      <span aria-hidden="true">
        {prefix} {person.name}
      </span>
    </span>
  );
}

function ParentLine({ invitation, side }: { invitation: Invitation; side: 'groom' | 'bride' }) {
  const family = invitation.families[side];
  const person = side === 'groom' ? invitation.groom : invitation.bride;
  const parents = namedParents(family);
  if (!family?.relation.trim() || parents.length === 0) return null;
  return (
    <p className="parent-line">
      {parents.map((parent, index) => (
        <span key={parent.name}>
          {index > 0 ? ' · ' : null}
          <span className="text-2">
            <PersonName person={parent} />
          </span>
        </span>
      ))}
      <span> 의 {family.relation} </span>
      <span className="body-strong">{person.givenName}</span>
    </p>
  );
}

function ContactGroup({ label, rows }: { label: string; rows: ContactRow[] }) {
  const notify = useToast();
  if (rows.length === 0) return null;
  return (
    <div className="contact-group">
      <h3 className="label-text">{label}</h3>
      <ul>
        {rows.map((row) => (
          <li key={row.id} className="contact-row">
            <div>
              <p className="caption">{row.relation}</p>
              <p className="body-strong">{row.name}</p>
              <p className="caption only-fine">{row.phone}</p>
            </div>
            <div className="contact-actions only-coarse">
              <a className="btn-icon" href={telHref(row.phone)} aria-label={`${row.name}에게 전화하기`}>
                <Phone size={18} />
              </a>
              <a className="btn-icon" href={smsHref(row.phone)} aria-label={`${row.name}에게 문자 보내기`}>
                <Message size={18} />
              </a>
            </div>
            <button
              type="button"
              className="btn btn-secondary only-fine"
              onClick={() => void copyText(row.phone, '전화번호를 복사했어요', notify)}
            >
              <Copy size={18} />
              번호 복사
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface StoryProps { invitation: Invitation; preview?: boolean }

const Story = ({ invitation, preview = false }: StoryProps) => {
  const greeting = invitation.greeting?.trim();
  const sign = [invitation.groom.givenName.trim(), invitation.bride.givenName.trim()].filter(Boolean).join(' · ');
  const groomLine = namedParents(invitation.families.groom).length > 0;
  const brideLine = namedParents(invitation.families.bride).length > 0;
  const contacts = contactsBySide(invitation);
  return (
    <>
      {greeting ? (
        <section className="section" id="greeting" aria-labelledby="greeting-title">
          <Reveal>
            <p className="eyebrow" aria-hidden="true">
              {eyebrows.greeting}
            </p>
            <h2 id="greeting-title" className="heading">
              초대합니다
            </h2>
            <p className="greeting-body">{greeting}</p>
            <hr className="hairline" />
            <p className="caption">
              {sign ? `${sign} 드림` : preview ? <span className="sample-text">서명</span> : null}
            </p>
          </Reveal>
        </section>
      ) : null}
      {groomLine || brideLine ? (
        <section className="section" id="parents" aria-labelledby="parents-title">
          <Reveal>
            <p className="eyebrow" aria-hidden="true">
              {eyebrows.parents}
            </p>
            <h2 id="parents-title" className="heading">
              양가 혼주
            </h2>
            <ParentLine invitation={invitation} side="groom" />
            <ParentLine invitation={invitation} side="bride" />
          </Reveal>
        </section>
      ) : null}
      {contacts.groom.length + contacts.bride.length > 0 ? (
        <section className="section" id="contact" aria-labelledby="contact-title">
          <p className="eyebrow" aria-hidden="true">
            {eyebrows.contact}
          </p>
          <h2 id="contact-title" className="heading">
            연락하기
          </h2>
          <ContactGroup label="신랑측" rows={contacts.groom} />
          <ContactGroup label="신부측" rows={contacts.bride} />
        </section>
      ) : null}
    </>
  );
}

export default Story;
