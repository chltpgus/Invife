import { Controller, Get, Inject, Injectable, Module, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import * as editor from '../editor/service';
import { PublicRoute } from '../shared/auth.guard';
import { APP_DEPS, type AppDeps } from '../shared/runtime';

@Injectable()
class PublicInvitationsService {
  constructor(@Inject(APP_DEPS) private readonly deps: AppDeps) {}

  list() {
    return editor.listPublicSlugs(this.deps.pool);
  }

  get(slug: string) {
    return editor.getPublicInvitation(this.deps.pool, slug);
  }
}

@PublicRoute()
@Controller('v1/invitations')
class PublicInvitationsController {
  constructor(@Inject(PublicInvitationsService) private readonly service: PublicInvitationsService) {}

  @Get()
  list(@Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=86400');
    return this.service.list();
  }

  @Get(':slug')
  get(@Param('slug') slug: string, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=86400');
    return this.service.get(slug);
  }
}

@Module({
  controllers: [PublicInvitationsController],
  providers: [PublicInvitationsService],
})
export class PublicInvitationsModule {}
