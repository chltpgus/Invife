'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { editorQueryKeys } from '@/domain/editor/queryKey';
import { hostQueryKeys } from '@/domain/host/queryKey';
import { sessionQueryKeys } from '@/domain/session/queryKey';
import { createEditorClient } from '@/editor/create-client';

export const useEditorSession = () =>
  useQuery({
    queryKey: sessionQueryKeys.current(),
    queryFn: () => createEditorClient().session(),
  });

export const useLinkKakao = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (redirectTo: string) => createEditorClient().linkKakao(redirectTo),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sessionQueryKeys.all });
    },
  });
};

export const useSignInKakao = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (redirectTo: string) => createEditorClient().signInKakao(redirectTo),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sessionQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: editorQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: hostQueryKeys.all });
    },
  });
};

export const useCreateClaimTicket = () =>
  useMutation({
    mutationFn: (invitationIds: string[]) => createEditorClient().createClaimTicket(invitationIds),
  });

export const useClaimDrafts = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ticket: string) => createEditorClient().claimDrafts(ticket),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: editorQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: hostQueryKeys.all });
    },
  });
};
