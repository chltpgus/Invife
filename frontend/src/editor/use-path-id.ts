'use client';

import { useEffect, useState } from 'react';

export function usePathId(fallback: string, section: 'edit' | 'dashboard'): { id: string; ready: boolean } {
  const [id, setId] = useState(fallback);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const parts = window.location.pathname.split('/').filter(Boolean);
    const index = parts.indexOf(section);
    const value = index >= 0 ? parts[index + 1] : '';
    if (value) setId(decodeURIComponent(value));
    setReady(true);
  }, [fallback, section]);
  return { id, ready };
}
