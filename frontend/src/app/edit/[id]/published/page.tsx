import PublishedScreen from '@/components/organisms/PublishedScreen';

export function generateStaticParams() {
  return [{ id: 'local' }];
}

export default async function PublishedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PublishedScreen routeId={id} />;
}
