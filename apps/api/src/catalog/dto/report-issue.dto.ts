import { IsString, MinLength } from 'class-validator';

export class ReportIssueDto {
  @IsString()
  @MinLength(1)
  description: string;
}
