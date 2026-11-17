'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/components/icon';

type ToastItem = { id: number; text: string; tone: 'ok' | 'err' };

const ToastContext = createContext<(text: string, tone?: 'ok' | 'err') => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export async function copyText(text: string, ok: string, notify: (text: string, tone?: 'ok' | 'err') => void) {
  try {
    await navigator.clipboard.writeText(text);
    notify(ok, 'ok');
  } catch {
    notify('길게 눌러 직접 복사해 주세요', 'err');
  }
}

export function ToastProvider({ children, lift }: { children: ReactNode; lift: boolean }) {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const timer = useRef<number | null>(null);
  const notify = useCallback((text: string, tone: 'ok' | 'err' = 'ok') => {
    if (timer.current) window.clearTimeout(timer.current);
    const item = { id: Date.now(), text, tone };
    setToast(item);
    timer.current = window.setTimeout(() => {
      setToast((current) => (current?.id === item.id ? null : current));
    }, 2000);
  }, []);
  const value = useMemo(() => notify, [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <p className={`toast ${lift ? 'is-lifted' : ''}`} role="status" aria-live="polite">
          <Icon name={toast.tone === 'ok' ? 'check' : 'alert'} size={16} />
          {toast.text}
        </p>
      ) : null}
    </ToastContext.Provider>
  );
}
