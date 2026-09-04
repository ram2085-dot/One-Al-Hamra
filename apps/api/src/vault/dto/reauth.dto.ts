import { IsString, MinLength } from 'class-validator';

export class ReauthDto {
  @IsString()
  @MinLength(1)
  adPassword!: string;
}
