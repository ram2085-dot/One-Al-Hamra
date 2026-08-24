import { IsArray, IsEnum, IsOptional, IsString, IsUrl } from 'class-validator';
import { LaunchType } from '@prisma/client';

export class CreateServiceDto {
  @IsString() name: string;
  @IsString() description: string;
  @IsOptional() @IsUrl() logoUrl?: string;
  @IsString() category: string;
  @IsArray() tags: string[];
  @IsOptional() @IsString() vendorName?: string;
  @IsString() ownerId: string;
  @IsEnum(LaunchType) launchType: LaunchType;
  @IsString() supportContact: string;
  @IsOptional() @IsUrl() docsUrl?: string;
  @IsOptional() @IsUrl() healthCheckUrl?: string;
}
