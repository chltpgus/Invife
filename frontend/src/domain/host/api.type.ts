/* eslint-disable @typescript-eslint/no-namespace */
import type {
  AppSettingsResult,
  DeleteInvitationResult,
  HostNotice,
  InvitationActionResult,
  InvitationSettingsPatch,
  InvitationSettingsResult,
  RecipientMutationResult,
  RsvpDashboardResult,
} from '@/editor/contract';

export namespace HostDomain {
  export namespace Publish {
    export type Res = InvitationActionResult;
  }
  export namespace Apply {
    export type Res = InvitationActionResult;
  }
  export namespace Unpublish {
    export type Res = InvitationActionResult;
  }
  export namespace DeleteInvitation {
    export type Req = { id: string; confirm?: string };
    export type Res = DeleteInvitationResult;
  }
  export namespace Recipients {
    export type Req = { id: string; names: string[] };
    export type Res = RecipientMutationResult;
  }
  export namespace RecipientName {
    export type Req = { id: string; recipientId: string; name: string };
    export type Res = RecipientMutationResult;
  }
  export namespace RecipientAction {
    export type Req = { id: string; recipientId: string };
    export type Res = RecipientMutationResult;
  }
  export namespace Rsvp {
    export type Res = RsvpDashboardResult;
  }
  export namespace Notices {
    export type Res = { notices: HostNotice[] };
  }
  export namespace AppSettings {
    export type Res = AppSettingsResult;
  }
  export namespace PatchAppSettings {
    export type Req = { adsEnabled: boolean };
    export type Res = AppSettingsResult;
  }
  export namespace InvitationSettings {
    export type Res = InvitationSettingsResult;
  }
  export namespace PatchInvitationSettings {
    export type Req = { id: string; body: InvitationSettingsPatch; ifMatch: string };
    export type Res = InvitationSettingsResult;
  }
}
