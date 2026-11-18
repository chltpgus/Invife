import StartScreen from '@/components/organisms/StartScreen';
import { getGuestDataSource } from '@/data';

export default async function HomePage() {
  const source = getGuestDataSource();
  const invitations = (await Promise.all((await source.listStaticParams()).map((item) => source.getInvitation(item.slug)))).filter(
    (invitation) => invitation !== null,
  );
  return (
    <StartScreen
      samples={invitations.map((invitation) => ({
        slug: invitation.slug,
        label: `${invitation.groom.name} · ${invitation.bride.name}`,
      }))}
    />
  );
}
