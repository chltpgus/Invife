import PublishScreen from '@/components/organisms/PublishScreen';

export function generateStaticParams() {
  return [{ id: 'local' }];
}

export default async function PublishPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PublishScreen routeId={id} />;
}
