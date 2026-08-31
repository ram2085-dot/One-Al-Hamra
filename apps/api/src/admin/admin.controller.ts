import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AdminService } from './admin.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { EntitlementDto } from './dto/entitlement.dto';
import { AliasDto } from './dto/alias.dto';
import type { User } from '@prisma/client';

@Controller('admin/services')
@Roles(Role.ADMIN)
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get()
  async list() {
    return this.adminService.listAll();
  }

  @Post()
  async create(@CurrentUser() user: User, @Body() dto: CreateServiceDto) {
    return this.adminService.createService(user.id, dto);
  }

  @Patch(':id')
  async update(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: UpdateServiceDto) {
    return this.adminService.updateService(user.id, id, dto);
  }

  @Post(':id/entitlements')
  async addEntitlement(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: EntitlementDto) {
    return this.adminService.addEntitlement(user.id, id, dto);
  }

  @Delete(':id/entitlements/:entitlementId')
  async removeEntitlement(@CurrentUser() user: User, @Param('id') id: string, @Param('entitlementId') entitlementId: string) {
    await this.adminService.removeEntitlement(user.id, id, entitlementId);
    return { ok: true };
  }

  @Post(':id/aliases')
  async addAlias(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: AliasDto) {
    return this.adminService.addAlias(user.id, id, dto);
  }

  @Delete(':id/aliases/:aliasId')
  async removeAlias(@CurrentUser() user: User, @Param('id') id: string, @Param('aliasId') aliasId: string) {
    await this.adminService.removeAlias(user.id, id, aliasId);
    return { ok: true };
  }
}
