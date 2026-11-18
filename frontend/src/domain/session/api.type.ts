/* eslint-disable @typescript-eslint/no-namespace */
import type { ClaimDraftsResult, ClaimTicketResult, EditorSession, KakaoLinkResult } from '@/editor/contract';

export namespace SessionDomain {
  export namespace Current {
    export type Res = EditorSession;
  }
  export namespace Link {
    export type Req = { redirectTo: string };
    export type Res = KakaoLinkResult;
  }
  export namespace ClaimTicket {
    export type Req = { invitationIds: string[] };
    export type Res = ClaimTicketResult;
  }
  export namespace ClaimDrafts {
    export type Req = { ticket: string };
    export type Res = ClaimDraftsResult;
  }
}
