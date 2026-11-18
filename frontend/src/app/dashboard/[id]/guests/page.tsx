import GuestsScreen from '@/components/organisms/GuestsScreen';

export function generateStaticParams() {
  return [{ id: 'local' }];
}

export default async function GuestsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GuestsScreen routeId={id} />;
}
