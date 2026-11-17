import Link from 'next/link';
import { getGuestDataSource } from '@/data';
import { guestPath } from '@/domain/links';

export default async function HomePage() {
  const source = getGuestDataSource();
  const invitations = (await Promise.all((await source.listStaticParams()).map((item) => source.getInvitation(item.slug)))).filter(
    (invitation) => invitation !== null,
  );
  return (
    <main className="column home" data-theme="ivory">
      <p className="eyebrow" aria-hidden="true">
        Invife
      </p>
      <h1 className="heading">샘플 초대장</h1>
      <ul>
        {invitations.map((invitation) => (
          <li key={invitation.slug}>
            <p className="body-strong">
              {invitation.groom.name} · {invitation.bride.name}
            </p>
            <Link href={guestPath(invitation.slug)}>{invitation.slug}</Link>
          </li>
        ))}
        <li>
          <Link href="/i/missing/">없는 초대장</Link>
        </li>
      </ul>
    </main>
  );
}
