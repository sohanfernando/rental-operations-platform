import { createHash, randomBytes } from 'node:crypto';
import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { APP_ENV, type AppEnvironment } from '../config';
import { Prisma, PrismaClient } from '../generated/prisma/client';
import { type LoginDto, type RegisterDto, type UserResponse } from './auth.dto';
import { dummyPasswordHash, hashPassword, verifyPassword } from './password';

const publicUser = { id: true, email: true, role: true } as const;

function sessionHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    private readonly database: PrismaClient,
    @Inject(APP_ENV) private readonly environment: AppEnvironment,
  ) {}

  async register(input: RegisterDto): Promise<UserResponse> {
    const passwordHash = await hashPassword(input.password);
    try {
      return await this.database.user.create({
        data: { email: input.email, passwordHash, role: 'CUSTOMER' },
        select: publicUser,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('An account already uses this email.');
      }
      throw error;
    }
  }

  async login(input: LoginDto, previousToken?: string) {
    const account = await this.database.user.findUnique({
      where: { email: input.email },
      select: { ...publicUser, passwordHash: true },
    });
    const valid = await verifyPassword(input.password, account?.passwordHash ?? dummyPasswordHash);
    if (!account || !valid) throw new UnauthorizedException('Email or password is incorrect.');

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.environment.SESSION_HOURS * 60 * 60 * 1000);
    await this.database.$transaction(async (transaction) => {
      if (previousToken) {
        await transaction.session.deleteMany({ where: { tokenHash: sessionHash(previousToken) } });
      }
      await transaction.session.create({
        data: { tokenHash: sessionHash(token), userId: account.id, expiresAt },
      });
    });
    const user: UserResponse = { id: account.id, email: account.email, role: account.role };
    return { user, token, expiresAt };
  }

  async authenticate(token?: string): Promise<UserResponse> {
    if (!token) throw new UnauthorizedException('Sign in to continue.');
    const session = await this.database.session.findUnique({
      where: { tokenHash: sessionHash(token), expiresAt: { gt: new Date() } },
      select: { user: { select: publicUser } },
    });
    if (!session) throw new UnauthorizedException('Session expired or revoked. Sign in again.');
    return session.user;
  }

  async logout(token?: string) {
    if (token) {
      await this.database.session.deleteMany({ where: { tokenHash: sessionHash(token) } });
    }
  }
}
