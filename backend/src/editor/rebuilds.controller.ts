import { Body, Controller, Get, Headers, HttpCode, Inject, Post, Query } from '@nestjs/common';
import { PublicRoute } from '../shared/auth.guard';
import { EditorService } from './editor.service';

@PublicRoute()
@Controller('v1/rebuilds')
export class RebuildsController {
  constructor(@Inject(EditorService) private readonly service: EditorService) {}

  @Get()
  list(@Headers('authorization') authorization: string | undefined, @Query('limit') limit?: string) {
    return this.service.listRebuilds(authorization, limit);
  }

  @Post('ack')
  @HttpCode(200)
  ack(@Headers('authorization') authorization: string | undefined, @Body() body: unknown) {
    return this.service.ackRebuilds(authorization, body);
  }
}
