'use client';

import { useEffect, useRef, type ReactNode } from 'react';

export function Reveal({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry || entry.intersectionRatio < 0.2) return;
        element.classList.add('is-in');
        observer.disconnect();
      },
      { threshold: [0, 0.2, 0.5, 1] },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${className ?? ''}`}>
      {children}
    </div>
  );
}
