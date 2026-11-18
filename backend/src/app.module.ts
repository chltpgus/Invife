import { DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EditorModule } from './editor/editor.module';
import { GuestModule } from './guest/guest.module';
import { PhotosModule } from './photos/photos.module';
import { PublicInvitationsModule } from './public-invitations/public-invitations.module';
import { AuthGuard } from './shared/auth.guard';
import { EtagInterceptor } from './shared/etag.interceptor';
import { HttpExceptionFilter } from './shared/http.filter';
import { APP_DEPS, type AppDeps } from './shared/runtime';

@Module({})
export class AppModule {
  static register(deps: AppDeps): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [GuestModule, PublicInvitationsModule, EditorModule, PhotosModule],
      providers: [
        { provide: APP_DEPS, useValue: deps },
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_INTERCEPTOR, useClass: EtagInterceptor },
        { provide: APP_FILTER, useClass: HttpExceptionFilter },
      ],
      exports: [APP_DEPS],
    };
  }
}
