import {
  Body, Controller, Get, Header, HttpCode, Post, Req, Res, UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse, ApiConflictResponse, ApiCookieAuth, ApiCreatedResponse,
  ApiForbiddenResponse, ApiNoContentResponse, ApiOkResponse, ApiResponse,
  ApiTags, ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { LoginDto, RegisterDto, UserResponse } from './auth.dto';
import { AuthService } from './auth.service';
import { Actor, SessionCookie, SessionGuard, type SessionRequest } from './session';

interface CookieResponse {
  cookie(name: string, value: string, options: object): void;
  clearCookie(name: string, options: object): void;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly cookie: SessionCookie) {}

  @Post('register')
  @UseGuards(ThrottlerGuard)
  @ApiCreatedResponse({ type: UserResponse })
  @ApiBadRequestResponse({ description: 'Invalid registration fields.' })
  @ApiForbiddenResponse({ description: 'Request origin is not allowed.' })
  @ApiConflictResponse({ description: 'The email is already registered.' })
  @ApiResponse({ status: 429, description: 'Too many registration attempts.' })
  register(@Body() input: RegisterDto) {
    return this.auth.register(input);
  }

  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @UseGuards(ThrottlerGuard)
  @ApiOkResponse({ type: UserResponse, description: 'Sets the HttpOnly session cookie.' })
  @ApiBadRequestResponse({ description: 'Invalid sign-in fields.' })
  @ApiForbiddenResponse({ description: 'Request origin is not allowed.' })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials.' })
  @ApiResponse({ status: 429, description: 'Too many sign-in attempts.' })
  async login(
    @Body() input: LoginDto,
    @Req() request: SessionRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    const { user, token, expiresAt } = await this.auth.login(input, this.cookie.read(request));
    response.cookie(this.cookie.name, token, { ...this.cookie.options, expires: expiresAt });
    return user;
  }

  @Get('me')
  @UseGuards(SessionGuard)
  @Header('Cache-Control', 'no-store')
  @ApiCookieAuth('session')
  @ApiOkResponse({ type: UserResponse })
  @ApiUnauthorizedResponse({ description: 'Missing, expired, or revoked session.' })
  me(@Actor() user: UserResponse) {
    return user;
  }

  @Post('logout')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Clears the session cookie and revokes its token.' })
  @ApiForbiddenResponse({ description: 'Request origin is not allowed.' })
  async logout(
    @Req() request: SessionRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    await this.auth.logout(this.cookie.read(request));
    response.clearCookie(this.cookie.name, this.cookie.options);
  }
}
