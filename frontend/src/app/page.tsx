import Link from 'next/link';
import { guestPath } from '@/domain/links';
import { fixtures } from '@/data/fixtures';

export default function HomePage() {
  return (
    <main className="column home" data-theme="ivory">
      <p className="eyebrow" aria-hidden="true">
        Invife
      </p>
      <h1 className="heading">샘플 초대장</h1>
      <ul>
        {fixtures.map((record) => (
          <li key={record.invitation.slug}>
            <p className="body-strong">
              {record.invitation.groom.name} · {record.invitation.bride.name}
            </p>
            <Link href={guestPath(record.invitation.slug)}>{record.invitation.slug} · 공용 초대장</Link>
            <Link href={guestPath(record.invitation.slug, { type: 'shared-rsvp', token: record.sharedRsvpToken })}>
              공용 응답
            </Link>
            {record.recipients.map((recipient) => (
              <Link key={recipient.token} href={guestPath(record.invitation.slug, { type: 'personal', token: recipient.token })}>
                {recipient.revoked ? '폐기된 링크' : recipient.name}
              </Link>
            ))}
          </li>
        ))}
        <li>
          <Link href="/i/missing/">없는 초대장</Link>
        </li>
      </ul>
    </main>
  );
}
