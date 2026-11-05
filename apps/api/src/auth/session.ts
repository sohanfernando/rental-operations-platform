import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  createParamDecorator,
} from '@nestjs/common';
import { parse } from 'cookie';
import { APP_ENV, type AppEnvironment } from '../config';
import { type UserResponse } from './auth.dto';
import { AuthService } from './auth.service';

export interface SessionRequest {
  method: string;
  headers: { cookie?: string; origin?: string };
  actor?: UserResponse;
  requestId?: string;
}

@Injectable()
export class SessionCookie {
  readonly name: string;
  readonly options: { httpOnly: true; secure: boolean; sameSite: 'lax'; path: '/' };

  constructor(@Inject(APP_ENV) environment: AppEnvironment) {
    const secure = environment.NODE_ENV === 'production';
    this.name = secure ? '__Host-rental_session' : 'rental_session';
    this.options = { httpOnly: true, secure, sameSite: 'lax', path: '/' };
  }

  read(request: SessionRequest) {
    const token = parse(request.headers.cookie ?? '')[this.name];
    return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined;
  }
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService, private readonly cookie: SessionCookie) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<SessionRequest>();
    request.actor = await this.auth.authenticate(this.cookie.read(request));
    return true;
  }
}

@Injectable()
export class StaffGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<SessionRequest>();
    if (request.actor?.role !== 'STAFF') throw new ForbiddenException('Staff access required.');
    return true;
  }
}

@Injectable()
export class CustomerGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<SessionRequest>();
    if (request.actor?.role !== 'CUSTOMER') throw new ForbiddenException('Customer access required.');
    return true;
  }
}

@Injectable()
export class SameOriginGuard implements CanActivate {
  constructor(@Inject(APP_ENV) private readonly environment: AppEnvironment) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<SessionRequest>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
    if (request.headers.origin !== this.environment.WEB_ORIGIN) {
      throw new ForbiddenException('Request origin is not allowed.');
    }
    return true;
  }
}

export const Actor = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<SessionRequest>().actor,
);
