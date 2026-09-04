import { IsISO8601, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCredentialDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsString()
  @MinLength(1)
  username!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  @IsOptional()
  @IsISO8601()
  passwordExpiresAt?: string;
}
