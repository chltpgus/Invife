/* eslint-disable @typescript-eslint/no-namespace */
import type { RsvpContextResult, RsvpSubmitBody, RsvpSubmitResult } from '@/domain/types';

export namespace RsvpDomain {
  export namespace Context {
    export type Req = { slug: string; token?: string };
    export type Res = RsvpContextResult | { status?: string };
  }
  export namespace Submit {
    export type Req = RsvpSubmitBody;
    export type Res = RsvpSubmitResult | { response?: unknown; error?: { code?: string; field?: string; reason?: string } };
  }
}
