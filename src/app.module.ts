import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config'
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AuthorizationModule } from './authorization/authorization.module.js';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './auth/guard/jwt-auth.guard.js';
import { PermissionGuard } from './authorization/guards/permission.guard.js';
import { WorkspacesModule } from './workspaces/workspaces.module.js';
import { WorkspacePermissionGuard } from './authorization/guards/workspace-permission.guard.js';
import { ShortLinksModule } from './short-links/short-links.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true
    }),
    PrismaModule,
    UsersModule,
    AuthModule,
    AuthorizationModule,
    WorkspacesModule,
    ShortLinksModule
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // 注册全局guard-顺序很重要
    // 必须先解决你是谁，然后判断你有什么权限
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard
    },
    // {
    //   provide: APP_GUARD,
    //   useClass: PermissionGuard
    // }
    {
      provide: APP_GUARD,
      useClass: WorkspacePermissionGuard
    }
  ],
})
export class AppModule {}
