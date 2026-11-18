/* eslint-disable @typescript-eslint/no-namespace */
import type { Invitation } from '@/domain/types';

export namespace InvitationDomain {
  export namespace List {
    export type Res = Array<{ slug: string }>;
  }
  export namespace Get {
    export type Req = { slug: string };
    export type Res = Invitation;
  }
}
