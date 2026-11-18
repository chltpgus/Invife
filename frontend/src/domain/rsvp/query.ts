'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import type { RsvpSubmitBody } from '@/domain/types';
import { rsvpQueryKeys } from '@/domain/rsvp/queryKey';
import { createRsvpClient } from '@/rsvp/create-client';

export const useRsvpContext = (slug: string, token?: string) =>
  useQuery({
    queryKey: rsvpQueryKeys.context(slug, token ?? null),
    queryFn: () => createRsvpClient().context({ slug, token }),
  });

export const useSubmitRsvp = () =>
  useMutation({
    mutationFn: (body: RsvpSubmitBody) => createRsvpClient().submit(body),
  });
