import SettingsScreen from '@/components/organisms/SettingsScreen';

export function generateStaticParams() {
  return [{ id: 'local' }];
}

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SettingsScreen routeId={id} />;
}
