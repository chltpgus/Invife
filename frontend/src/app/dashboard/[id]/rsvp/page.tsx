import RsvpScreen from '@/components/organisms/RsvpScreen';

export function generateStaticParams() {
  return [{ id: 'local' }];
}

export default async function RsvpPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RsvpScreen routeId={id} />;
}
