import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Injectable,
  Module,
  Param,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthClaims } from '../auth/jwt';
import * as editor from '../editor/service';
import { claims, PublicRoute, type AuthenticatedRequest } from '../shared/auth.guard';
import { APP_DEPS, type AppDeps } from '../shared/runtime';

@Injectable()
class PhotosService {
  private readonly deps: editor.EditorDeps;

  constructor(@Inject(APP_DEPS) runtime: AppDeps) {
    this.deps = {
      pool: runtime.pool,
      config: runtime.config,
      storage: runtime.storage,
      now: runtime.now ?? (() => new Date()),
      schedule: runtime.schedule,
    };
  }

  presign(auth: AuthClaims, invitationId: string, body: unknown) {
    return editor.presignPhoto(this.deps, auth, invitationId, body);
  }
  complete(auth: AuthClaims, invitationId: string, photoId: string) {
    return editor.completePhoto(this.deps, auth, invitationId, photoId);
  }
  list(auth: AuthClaims, invitationId: string) {
    return editor.listPhotos(this.deps, auth, invitationId);
  }
  get(auth: AuthClaims, invitationId: string, photoId: string) {
    return editor.getPhoto(this.deps, auth, invitationId, photoId);
  }
  remove(auth: AuthClaims, invitationId: string, photoId: string) {
    return editor.deletePhoto(this.deps, auth, invitationId, photoId);
  }
  saveUpload(token: string, body: Buffer, contentType?: string) {
    return editor.saveUpload(this.deps, token, body, contentType);
  }
}

@Controller('v1/editor')
class PhotosController {
  constructor(@Inject(PhotosService) private readonly service: PhotosService) {}

  @Post('invitations/:id/photos/presign')
  presign(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.presign(claims(request), id, body);
  }

  @Post('invitations/:id/photos/:photoId/complete')
  async complete(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('photoId') photoId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const body = await this.service.complete(claims(request), id, photoId);
    response.status(body.photo.status === 'processing' ? 202 : 200);
    return body;
  }

  @Get('invitations/:id/photos')
  list(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.list(claims(request), id);
  }

  @Get('invitations/:id/photos/:photoId')
  get(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Param('photoId') photoId: string) {
    return this.service.get(claims(request), id, photoId);
  }

  @Delete('invitations/:id/photos/:photoId')
  @HttpCode(204)
  async remove(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Param('photoId') photoId: string) {
    await this.service.remove(claims(request), id, photoId);
  }

  @PublicRoute()
  @Put('uploads/:token')
  @HttpCode(204)
  async upload(
    @Param('token') token: string,
    @Req() request: Request,
    @Headers('content-type') contentType?: string,
  ) {
    const body = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
    await this.service.saveUpload(token, body, contentType);
  }
}

@Module({
  controllers: [PhotosController],
  providers: [PhotosService],
})
export class PhotosModule {}
