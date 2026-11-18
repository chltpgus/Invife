'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

interface SheetProps { title: string; onClose: () => void; children: ReactNode }

const Sheet =({ title, onClose, children }: SheetProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.querySelector<HTMLElement>('h2, button, input, textarea')?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab' || !dialog) return;
      const items = [...dialog.querySelectorAll<HTMLElement>('button, input, textarea, select, a[href]')].filter((node) => !node.hasAttribute('disabled'));
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div className="ed-scrim" onMouseDown={onClose}>
      <div ref={ref} className="ed-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} onMouseDown={(event) => event.stopPropagation()}>
        <h2 id={titleId} tabIndex={-1}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

export default Sheet;
