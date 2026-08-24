import { Controller, Get, Query, Post, Delete, Param, Body } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ReportIssueDto } from './dto/report-issue.dto';
import type { User } from '@prisma/client';

@Controller('catalog')
export class CatalogController {
  constructor(private catalogService: CatalogService) {}

  @Get()
  async list(@CurrentUser() user: User) {
    return this.catalogService.listForUser(user);
  }

  @Get('search')
  async search(@CurrentUser() user: User, @Query('q') q: string) {
    return this.catalogService.search(user, q ?? '');
  }

  @Get(':id')
  async detail(@CurrentUser() user: User, @Param('id') id: string) {
    return this.catalogService.getDetailForUser(user, id);
  }

  @Post(':id/report-issue')
  async reportIssue(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: ReportIssueDto) {
    return this.catalogService.reportIssue(user, id, dto.description);
  }

  @Post(':id/favorite')
  async favorite(@CurrentUser() user: User, @Param('id') id: string) {
    await this.catalogService.addFavorite(user.id, id);
    return { ok: true };
  }

  @Delete(':id/favorite')
  async unfavorite(@CurrentUser() user: User, @Param('id') id: string) {
    await this.catalogService.removeFavorite(user.id, id);
    return { ok: true };
  }
}
