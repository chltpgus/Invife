export function motionBehavior(): ScrollBehavior {
  if (typeof window === 'undefined') return 'auto';
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

export function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: motionBehavior(), block: 'start' });
}
