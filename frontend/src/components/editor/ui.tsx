'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

export function Field({
  id,
  label,
  required,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="ed-field">
      <label htmlFor={id}>
        {label}
        {required ? <span className="ed-req"> 필수</span> : null}
      </label>
      {children}
      {error ? (
        <p id={errorId} className="ed-error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="ed-hint">{hint}</p>
      ) : null}
    </div>
  );
}

export function describedBy(error: string | null | undefined, id: string): string | undefined {
  return error ? `${id}-error` : undefined;
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
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
