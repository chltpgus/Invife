'use client';

import { scrollToId } from '@/components/scroll';

export type NavItem = { id: string; label: string };

export function QuickNav({
  items,
  current,
  visible,
  onAccounts,
}: {
  items: NavItem[];
  current: string;
  visible: boolean;
  onAccounts: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <nav className={`quicknav ${visible ? 'is-on' : ''}`} aria-label="바로가기">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-current={current === item.id ? 'true' : undefined}
          onClick={() => {
            if (item.id === 'accounts') onAccounts();
            scrollToId(item.id);
          }}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
