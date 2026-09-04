import { IsOptional, IsString } from 'class-validator';

/** Body of `POST /credential-launch/:serviceId`. `credentialId` is optional (omitted = use the
 *  default credential); the global `ValidationPipe({ whitelist: true })` strips/rejects any
 *  non-string so a `{ credentialId: { not: 'x' } }` filter object never reaches Prisma's `where`. */
export class LaunchDto {
  @IsOptional()
  @IsString()
  credentialId?: string;
}
