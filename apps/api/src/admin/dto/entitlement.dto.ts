import { IsEnum, IsOptional, IsString } from 'class-validator';
import { Role } from '@prisma/client';

export class EntitlementDto {
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsEnum(Role) role?: Role;
  @IsOptional() @IsString() group?: string;
}
