import { Module } from '@nestjs/common';
import { EditorService } from './editor.service';
import { InvitationsController } from './invitations.controller';
import { RebuildsController } from './rebuilds.controller';

@Module({
  controllers: [InvitationsController, RebuildsController],
  providers: [EditorService],
})
export class EditorModule {}
