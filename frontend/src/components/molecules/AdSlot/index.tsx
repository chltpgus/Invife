'use client';

import { useAppSettings } from '@/domain/host/query';

interface AdSlotProps {
  label?: string;
}

const AdSlot = ({ label = '광고' }: AdSlotProps) => {
  const settings = useAppSettings();
  if (!settings.data?.ok || !settings.data.settings.showAds) return null;
  return <aside className="ed-card" aria-label={label}>{label}</aside>;
};

export default AdSlot;
