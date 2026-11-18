import { Body, Controller, Headers, HttpCode, Inject, Injectable, Module, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import * as guest from './service';
import { clientIp } from '../http';
import { verifyTurnstile } from '../turnstile';
import { PublicRoute } from '../shared/auth.guard';
import { APP_DEPS, type AppDeps } from '../shared/runtime';

@Injectable()
class GuestRsvpService {
  private readonly deps: guest.GuestDeps;

  constructor(@Inject(APP_DEPS) deps: AppDeps) {
    this.deps = {
      pool: deps.pool,
      config: deps.config,
      now: deps.now ?? (() => new Date()),
      verifyTurnstile:
        deps.verifyTurnstile ??
        ((token, ip) => verifyTurnstile(token, ip, deps.config.turnstileSecret, deps.config.turnstileHostname)),
    };
  }

  context(body: unknown, ip: string) {
    return guest.rsvpContext(this.deps, body, ip);
  }

  submit(body: unknown, ip: string) {
    return guest.submitRsvp(this.deps, body, ip);
  }
}

@PublicRoute()
@Controller('functions/v1')
class GuestRsvpController {
  constructor(@Inject(GuestRsvpService) private readonly service: GuestRsvpService) {}

  @Post('rsvp-context')
  @HttpCode(200)
  async context(
    @Body() body: unknown,
    @Headers('x-forwarded-for') forwardedFor: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.service.context(body, clientIp(forwardedFor));
  }

  @Post('rsvp')
  @HttpCode(200)
  async submit(
    @Body() body: unknown,
    @Headers('x-forwarded-for') forwardedFor: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.service.submit(body, clientIp(forwardedFor));
  }
}

@Module({
  controllers: [GuestRsvpController],
  providers: [GuestRsvpService],
})
export class GuestModule {}
