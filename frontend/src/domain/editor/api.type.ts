/* eslint-disable @typescript-eslint/no-namespace */
import type { AutosaveBody, CreateInvitationBody, EditorInvitation, EditorInvitationSummary, EditorPhoto, PresignBody, PresignResult } from '@/editor/contract';

export namespace EditorDomain {
  export namespace ListInvitations {
    export type Res = { invitations: EditorInvitationSummary[] };
  }
  export namespace CreateInvitation {
    export type Req = CreateInvitationBody;
  }
  export namespace InvitationBody {
    export type Res = { invitation?: EditorInvitation; etag?: string };
  }
  export namespace Autosave {
    export type Req = AutosaveBody;
    export type Res = { invitation?: EditorInvitation; etag?: string; error?: { code?: string; field?: string } };
  }
  export namespace Presign {
    export type Req = PresignBody;
    export type Res = PresignResult;
  }
  export namespace PhotoBody {
    export type Res = { photo?: EditorPhoto; etag?: string };
  }
  export namespace PhotosBody {
    export type Res = { photos?: EditorPhoto[]; etag?: string };
  }
}
