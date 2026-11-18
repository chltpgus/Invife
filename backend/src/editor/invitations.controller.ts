import { Body, Controller, Delete, Get, Headers, HttpCode, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import { clientIp } from '../http';
import { claims, type AuthenticatedRequest } from '../shared/auth.guard';
import { EditorService } from './editor.service';

@Controller('v1/editor')
export class InvitationsController {
  constructor(@Inject(EditorService) private readonly service: EditorService) {}

  @Get('session')
  session(@Req() request: AuthenticatedRequest) {
    return this.service.session(claims(request));
  }

  @Get('notices')
  notices(@Req() request: AuthenticatedRequest) {
    return this.service.notices(claims(request));
  }

  @Get('invitations')
  list(@Req() request: AuthenticatedRequest) {
    return this.service.list(claims(request));
  }

  @Post('invitations')
  create(@Req() request: AuthenticatedRequest, @Body() body: unknown, @Headers('x-forwarded-for') forwardedFor?: string) {
    return this.service.create(claims(request), body, clientIp(forwardedFor));
  }

  @Get('invitations/:id')
  get(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.get(claims(request), id);
  }

  @Patch('invitations/:id')
  autosave(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('if-match') ifMatch?: string,
  ) {
    return this.service.autosave(claims(request), id, body, ifMatch);
  }

  @Post('invitations/:id/publish')
  @HttpCode(200)
  publish(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.publish(claims(request), id);
  }

  @Post('invitations/:id/apply')
  @HttpCode(200)
  apply(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.apply(claims(request), id);
  }

  @Post('invitations/:id/unpublish')
  @HttpCode(200)
  unpublish(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.unpublish(claims(request), id);
  }

  @Delete('invitations/:id')
  remove(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.remove(claims(request), id, body);
  }

  @Get('invitations/:id/rsvp')
  rsvp(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.rsvp(claims(request), id);
  }

  @Post('invitations/:id/recipients')
  addRecipients(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.addRecipients(claims(request), id, body);
  }

  @Patch('invitations/:id/recipients/:recipientId')
  renameRecipient(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('recipientId') recipientId: string,
    @Body() body: unknown,
  ) {
    return this.service.renameRecipient(claims(request), id, recipientId, body);
  }

  @Post('invitations/:id/recipients/:recipientId/revoke')
  @HttpCode(200)
  revokeRecipient(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('recipientId') recipientId: string,
  ) {
    return this.service.revokeRecipient(claims(request), id, recipientId);
  }

  @Post('invitations/:id/recipients/:recipientId/reissue')
  @HttpCode(200)
  reissueRecipient(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('recipientId') recipientId: string,
  ) {
    return this.service.reissueRecipient(claims(request), id, recipientId);
  }

  @Post('claim-tickets')
  issueClaim(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.service.issueClaim(claims(request), body);
  }

  @Post('drafts/claim')
  @HttpCode(200)
  claimDrafts(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.service.claimDrafts(claims(request), body);
  }
}
