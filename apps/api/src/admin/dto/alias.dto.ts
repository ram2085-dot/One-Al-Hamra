import { IsString, MinLength } from 'class-validator';

export class AliasDto {
  @IsString() @MinLength(1) alias!: string;
}
