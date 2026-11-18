import { Module } from '@nestjs/common';
import { EditorService } from './editor.service';
import { InvitationsController } from './invitations.controller';

@Module({
  controllers: [InvitationsController],
  providers: [EditorService],
})
export class EditorModule {}
