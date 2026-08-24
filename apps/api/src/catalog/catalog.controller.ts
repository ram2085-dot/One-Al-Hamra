import { Controller, Get } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { User } from '@prisma/client';

@Controller('catalog')
export class CatalogController {
  constructor(private catalogService: CatalogService) {}

  @Get()
  async list(@CurrentUser() user: User) {
    return this.catalogService.listForUser(user);
  }
}
