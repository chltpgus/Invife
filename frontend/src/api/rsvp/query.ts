'use client';

import { useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { rsvpQueryKeys } from '@/api/rsvp/queryKey';
import type { RsvpSubmitBody } from '@/domain/types';
import { createRsvpClient } from '@/rsvp/create-client';

export function useRsvpContext(slug: string, token: string | undefined) {
  const client = useRef(createRsvpClient()).current;
  return useQuery({
    queryKey: rsvpQueryKeys.context(slug, token),
    queryFn: () => client.context({ slug, token }),
  });
}

export function useSubmitRsvp() {
  const client = useRef(createRsvpClient()).current;
  return useMutation({
    mutationFn: (body: RsvpSubmitBody) => client.submit(body),
  });
}
