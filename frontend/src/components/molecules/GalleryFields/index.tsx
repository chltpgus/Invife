'use client';

import PhotoPanel from '@/components/molecules/PhotoPanel';
import type { FormBag } from '@/components/molecules/editorForm/shared';

interface GalleryFieldsProps extends FormBag {
  onMessage: (text: string) => void;
  uploadFile: (file: File) => Promise<{ photo: import('@/domain/types').Photo } | { error: string }>;
  removePhoto: (id: string) => Promise<boolean>;
}

const GalleryFields = ({ draft, onChange, onMessage, uploadFile, removePhoto }: GalleryFieldsProps) => {
  return (
    <PhotoPanel
      photos={draft.invitation.photos}
      tone={draft.photoTone}
      onPhotos={(photos) => onChange({ ...draft, invitation: { ...draft.invitation, photos } })}
      onTone={(photoTone) => onChange({
        ...draft,
        photoTone,
        photoAdjust: Object.fromEntries(draft.invitation.photos.map((photo) => [photo.id, { crop: draft.photoAdjust[photo.id]?.crop ?? { x: 0, y: 0, width: 1, height: 1 }, filter: photoTone }])),
      })}
      onMessage={onMessage}
      uploadFile={uploadFile}
      removePhoto={removePhoto}
    />
  );
}

export default GalleryFields;
