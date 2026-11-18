import type {
  AutosaveBody,
  AutosaveResult,
  CreateInvitationBody,
  EditorInvitation,
  EditorInvitationSummary,
  EditorPhoto,
  PhotoStepResult,
  PresignBody,
  PresignResult,
  PresignStep,
} from '@/editor/contract';

/**
 * 제작 API. 경로는 docs/api/editor-api-contract.md.
 * 자동 저장은 PATCH 와 필수 `If-Match`(현재 etag)다. 없으면 400, 다르면 409 와 현재 invitation.
 * 사진 본문은 자동 저장에 넣지 않는다. sort·focal·crop·filter 만 PATCH 하고, 삭제는 DELETE 다.
 */
export interface EditorClient {
  listInvitations(): Promise<EditorInvitationSummary[]>;
  createInvitation(body: CreateInvitationBody): Promise<EditorInvitation>;
  getInvitation(id: string): Promise<EditorInvitation | null>;
  autosave(id: string, body: AutosaveBody, ifMatch: string): Promise<AutosaveResult>;
  presignPhoto(invitationId: string, body: PresignBody): Promise<PresignStep>;
  putPhoto(target: PresignResult, body: Blob): Promise<boolean>;
  completePhoto(invitationId: string, photoId: string): Promise<PhotoStepResult>;
  getPhotos(invitationId: string): Promise<{ etag: string; photos: EditorPhoto[] } | null>;
  getPhoto(invitationId: string, photoId: string): Promise<{ etag: string; photo: EditorPhoto } | null>;
  deletePhoto(invitationId: string, photoId: string): Promise<PhotoStepResult>;
}

export function summarizeInvitation(invitation: EditorInvitation): EditorInvitationSummary {
  const cover = [...invitation.photos].reverse().find((photo) => photo.status === 'ready' && photo.src);
  const first = invitation.photos.find((photo) => photo.status === 'ready' && photo.src) ?? cover;
  return {
    id: invitation.id,
    slug: invitation.slug,
    status: invitation.status,
    theme: invitation.theme,
    groomName: invitation.groom.name,
    brideName: invitation.bride.name,
    ceremonyDate: invitation.ceremony.date,
    coverSrc: first?.src?.thumb ?? null,
    rsvp: { responses: 0, attendingGuests: 0, declined: 0, unanswered: null },
    hasUnpublishedChanges: invitation.hasUnpublishedChanges,
    purgeAt: invitation.purgeAt,
    updatedAt: invitation.updatedAt,
    etag: invitation.etag,
  };
}
