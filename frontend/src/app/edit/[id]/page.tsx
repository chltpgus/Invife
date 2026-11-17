import { EditorScreen } from '@/components/editor/editor-screen';

export function generateStaticParams() {
  return [{ id: 'local' }];
}

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditorScreen routeId={id} />;
}
