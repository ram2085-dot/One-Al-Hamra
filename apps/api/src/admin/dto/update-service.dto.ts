import { PartialType } from '@nestjs/mapped-types';
import { IsEnum, IsOptional } from 'class-validator';
import { ServiceStatus, SsoTargetApp } from '@prisma/client';
import { CreateServiceDto } from './create-service.dto';

export class UpdateServiceDto extends PartialType(CreateServiceDto) {
  @IsOptional() @IsEnum(ServiceStatus) status?: ServiceStatus;
  @IsOptional() @IsEnum(SsoTargetApp) ssoTargetApp?: SsoTargetApp | null;
}
