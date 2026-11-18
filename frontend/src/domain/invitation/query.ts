'use client';

import { useQuery } from '@tanstack/react-query';
import { getGuestDataSource } from '@/data';
import { invitationQueryKeys } from '@/domain/invitation/queryKey';

export const usePublishedInvitation = (slug: string) =>
  useQuery({
    queryKey: invitationQueryKeys.detail(slug),
    queryFn: () => getGuestDataSource().getInvitation(slug),
  });

export const usePublishedInvitations = () =>
  useQuery({
    queryKey: invitationQueryKeys.list(),
    queryFn: () => getGuestDataSource().listStaticParams(),
  });
