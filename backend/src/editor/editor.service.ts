import { Inject, Injectable } from '@nestjs/common';
import type { AuthClaims } from '../auth/jwt';
import * as editor from './service';
import { APP_DEPS, type AppDeps } from '../shared/runtime';

@Injectable()
export class EditorService {
  readonly deps: editor.EditorDeps;

  constructor(@Inject(APP_DEPS) runtime: AppDeps) {
    this.deps = {
      pool: runtime.pool,
      config: runtime.config,
      storage: runtime.storage,
      now: runtime.now ?? (() => new Date()),
      schedule: runtime.schedule,
    };
  }

  session(claims: AuthClaims) { return editor.session(this.deps, claims); }
  notices(claims: AuthClaims) { return editor.listNotices(this.deps, claims); }
  list(claims: AuthClaims) { return editor.listInvitations(this.deps, claims); }
  create(claims: AuthClaims, body: unknown, ip: string) { return editor.createInvitation(this.deps, claims, body, ip); }
  get(claims: AuthClaims, id: string) { return editor.getInvitation(this.deps, claims, id); }
  autosave(claims: AuthClaims, id: string, body: unknown, ifMatch?: string) {
    return editor.autosave(this.deps, claims, id, body, ifMatch);
  }
  publish(claims: AuthClaims, id: string) { return editor.publish(this.deps, claims, id); }
  apply(claims: AuthClaims, id: string) { return editor.applyChanges(this.deps, claims, id); }
  unpublish(claims: AuthClaims, id: string) { return editor.unpublish(this.deps, claims, id); }
  remove(claims: AuthClaims, id: string, body: unknown) { return editor.removeInvitation(this.deps, claims, id, body); }
  settings(claims: AuthClaims, id: string) { return editor.getSettings(this.deps, claims, id); }
  updateSettings(claims: AuthClaims, id: string, body: unknown, ifMatch?: string) {
    return editor.updateSettings(this.deps, claims, id, body, ifMatch);
  }
  appSettings(claims: AuthClaims) { return editor.readAppSettings(this.deps, claims); }
  updateAppSettings(claims: AuthClaims, body: unknown) { return editor.updateAppSettings(this.deps, claims, body); }
  rsvp(claims: AuthClaims, id: string) { return editor.rsvpDashboard(this.deps, claims, id); }
  addRecipients(claims: AuthClaims, id: string, body: unknown) { return editor.addRecipients(this.deps, claims, id, body); }
  renameRecipient(claims: AuthClaims, id: string, recipientId: string, body: unknown) {
    return editor.renameRecipient(this.deps, claims, id, recipientId, body);
  }
  revokeRecipient(claims: AuthClaims, id: string, recipientId: string) {
    return editor.revokeRecipient(this.deps, claims, id, recipientId);
  }
  reissueRecipient(claims: AuthClaims, id: string, recipientId: string) {
    return editor.reissueRecipient(this.deps, claims, id, recipientId);
  }
  issueClaim(claims: AuthClaims, body: unknown) { return editor.issueClaim(this.deps, claims, body); }
  claimDrafts(claims: AuthClaims, body: unknown) { return editor.claimDrafts(this.deps, claims, body); }
  listRebuilds(authorization: string | undefined, limit: unknown) {
    return editor.listStaticRebuilds(this.deps, authorization, limit);
  }
  ackRebuilds(authorization: string | undefined, body: unknown) {
    return editor.ackStaticRebuilds(this.deps, authorization, body);
  }
}
