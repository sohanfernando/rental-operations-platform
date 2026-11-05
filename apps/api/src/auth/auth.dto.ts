import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { Role } from '../generated/prisma/client';

export class LoginDto {
  @ApiProperty({ format: 'email', maxLength: 254 })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ format: 'password', maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}

export class RegisterDto extends LoginDto {
  @ApiProperty({ format: 'password', minLength: 12, maxLength: 128 })
  @MinLength(12)
  declare password: string;
}

export class UserResponse {
  @ApiProperty()
  id!: number;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty({ enum: Role })
  role!: Role;
}
