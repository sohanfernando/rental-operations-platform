import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CustomerGuard, SameOriginGuard, SessionCookie, SessionGuard, StaffGuard } from './session';

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }])],
  controllers: [AuthController],
  providers: [AuthService, SessionCookie, SessionGuard, StaffGuard, CustomerGuard, {
    provide: APP_GUARD,
    useClass: SameOriginGuard,
  }],
  exports: [AuthService, SessionCookie, SessionGuard, StaffGuard, CustomerGuard, ThrottlerModule],
})
export class AuthModule {}
