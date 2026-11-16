import type { Metadata } from 'next';
import { NotFoundView } from '@/components/ended-view';

export const metadata: Metadata = {
  title: '초대장을 찾을 수 없어요',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return <NotFoundView />;
}
