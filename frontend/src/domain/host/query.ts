'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { editorQueryKeys } from '@/domain/editor/queryKey';
import { hostQueryKeys } from '@/domain/host/queryKey';
import { sessionQueryKeys } from '@/domain/session/queryKey';
import { createEditorClient } from '@/editor/create-client';
import type { EditorInvitationSummary } from '@/editor/contract';

export const useDashboardInvitations = () =>
  useQuery({
    queryKey: editorQueryKeys.list(),
    queryFn: () => createEditorClient().listInvitations(),
  });

export const useHostNotices = () =>
  useQuery({
    queryKey: hostQueryKeys.notices(),
    queryFn: () => createEditorClient().notices(),
  });

export const useAppSettings = () =>
  useQuery({
    queryKey: hostQueryKeys.appSettings(),
    queryFn: () => createEditorClient().appSettings(),
  });

export const usePatchAppSettings = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (adsEnabled: boolean) => createEditorClient().updateAppSettings(adsEnabled),
    onSuccess: (result) => {
      if (!result.ok) return;
      void queryClient.invalidateQueries({ queryKey: hostQueryKeys.appSettings() });
      void queryClient.invalidateQueries({ queryKey: sessionQueryKeys.all });
    },
  });
};

export const useInvitationSettings = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: hostQueryKeys.invitationSettings(id),
    queryFn: () => createEditorClient().invitationSettings(id),
    enabled,
  });

export const usePatchInvitationSettings = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; body: { rsvp?: { deadline?: string | null; enabled?: boolean }; slug?: string; publicLinkEnabled?: boolean }; ifMatch: string }) =>
      createEditorClient().updateInvitationSettings(input.id, input.body, input.ifMatch),
    onSuccess: (result, input) => {
      if (!result.ok) return;
      void queryClient.invalidateQueries({ queryKey: hostQueryKeys.invitationSettings(input.id) });
      void queryClient.invalidateQueries({ queryKey: editorQueryKeys.all });
    },
  });
};

export const useRsvpDashboard = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: hostQueryKeys.rsvp(id),
    queryFn: () => createEditorClient().rsvpDashboard(id),
    enabled,
  });

export const usePublishInvitation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => createEditorClient().publish(id),
    onSuccess: (result) => {
      if (!result.ok) return;
      void queryClient.invalidateQueries({ queryKey: editorQueryKeys.all });
    },
  });
};

export const useApplyInvitation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => createEditorClient().applyChanges(id),
    onSuccess: (result) => {
      if (!result.ok) return;
      void queryClient.invalidateQueries({ queryKey: editorQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: hostQueryKeys.all });
    },
  });
};

export const useUnpublishInvitation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => createEditorClient().unpublish(id),
    onSuccess: (result) => {
      if (!result.ok) return;
      void queryClient.invalidateQueries({ queryKey: editorQueryKeys.all });
    },
  });
};

export const useDeleteInvitation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; confirm?: string }) => createEditorClient().deleteInvitation(input.id, input.confirm),
    onSuccess: (result) => {
      if (!result.ok) return;
      void queryClient.invalidateQueries({ queryKey: editorQueryKeys.all });
    },
  });
};

export const useAddRecipients = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; names: string[] }) => createEditorClient().addRecipients(input.id, input.names),
    onSuccess: (result, input) => {
      if (!result.ok) return;
      void queryClient.invalidateQueries({ queryKey: hostQueryKeys.rsvp(input.id) });
      void queryClient.invalidateQueries({ queryKey: editorQueryKeys.list() });
    },
  });
};

export const useUpdateRecipient = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; recipientId: string; name: string }) => createEditorClient().updateRecipient(input.id, input.recipientId, input.name),
    onSuccess: (result, input) => {
      if (!result.ok) return;
      void queryClient.invalidateQueries({ queryKey: hostQueryKeys.rsvp(input.id) });
    },
  });
};

export const useReissueRecipient = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; recipientId: string }) => createEditorClient().reissueRecipient(input.id, input.recipientId),
    onSuccess: (result, input) => {
      if (!result.ok) return;
      void queryClient.invalidateQueries({ queryKey: hostQueryKeys.rsvp(input.id) });
    },
  });
};

export const useRevokeRecipient = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; recipientId: string }) => createEditorClient().revokeRecipient(input.id, input.recipientId),
    onSuccess: (result, input) => {
      if (!result.ok) return;
      void queryClient.invalidateQueries({ queryKey: hostQueryKeys.rsvp(input.id) });
      void queryClient.invalidateQueries({ queryKey: editorQueryKeys.list() });
    },
  });
};

export type { EditorInvitationSummary };
