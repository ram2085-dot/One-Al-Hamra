import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AdminService } from './admin.service';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('AdminService', () => {
  let service: AdminService;
  const prisma = {
    service: { findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
  };
  const audit = { record: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(AdminService);
  });

  it('listAll returns every service regardless of status', async () => {
    prisma.service.findMany.mockResolvedValue([]);
    await service.listAll();
    expect(prisma.service.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: undefined }));
  });

  it('createService creates the service and writes exactly one ADMIN_CHANGE audit row', async () => {
    const dto = { name: 'New Svc', description: 'd', category: 'IT', tags: [], ownerId: 'owner1', launchType: 'SSO', supportContact: 'x@y.com' };
    prisma.service.create.mockResolvedValue({ id: 's1', ...dto });
    const result = await service.createService('admin1', dto as any);
    expect(result.id).toBe('s1');
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith('admin1', 'ADMIN_CHANGE', 's1', expect.objectContaining({ action: 'create' }));
  });

  it('updateService updates and writes exactly one ADMIN_CHANGE audit row', async () => {
    prisma.service.update.mockResolvedValue({ id: 's1', name: 'Renamed' });
    await service.updateService('admin1', 's1', { name: 'Renamed' } as any);
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith('admin1', 'ADMIN_CHANGE', 's1', expect.objectContaining({ action: 'update' }));
  });

  describe('AdminService entitlements', () => {
    it('addEntitlement creates the row and writes one ADMIN_CHANGE audit row', async () => {
      (prisma as any).serviceEntitlement = { create: jest.fn().mockResolvedValue({ id: 'e1' }), delete: jest.fn() };
      await service.addEntitlement('admin1', 's1', { department: 'Finance' } as any);
      expect((prisma as any).serviceEntitlement.create).toHaveBeenCalledWith({ data: { serviceId: 's1', department: 'Finance', role: undefined, group: undefined } });
      expect(audit.record).toHaveBeenCalledWith('admin1', 'ADMIN_CHANGE', 's1', expect.objectContaining({ action: 'add-entitlement' }));
    });

    it('removeEntitlement deletes the row and writes one ADMIN_CHANGE audit row', async () => {
      (prisma as any).serviceEntitlement = { delete: jest.fn().mockResolvedValue({}) };
      await service.removeEntitlement('admin1', 's1', 'e1');
      expect((prisma as any).serviceEntitlement.delete).toHaveBeenCalledWith({ where: { id: 'e1' } });
      expect(audit.record).toHaveBeenCalledWith('admin1', 'ADMIN_CHANGE', 's1', expect.objectContaining({ action: 'remove-entitlement' }));
    });

    it('removeEntitlement raises NotFoundException (not a 500) when the row does not exist', async () => {
      (prisma as any).serviceEntitlement = { delete: jest.fn().mockRejectedValue(recordNotFoundError()) };
      await expect(service.removeEntitlement('admin1', 's1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('removeEntitlement lets non-P2025 errors propagate unchanged', async () => {
      const boom = new Error('connection reset');
      (prisma as any).serviceEntitlement = { delete: jest.fn().mockRejectedValue(boom) };
      await expect(service.removeEntitlement('admin1', 's1', 'e1')).rejects.toBe(boom);
    });
  });

  describe('AdminService aliases', () => {
    it('addAlias creates the row and writes one ADMIN_CHANGE audit row', async () => {
      (prisma as any).serviceAlias = { create: jest.fn().mockResolvedValue({ id: 'a1' }), delete: jest.fn() };
      await service.addAlias('admin1', 's1', { alias: 'expenses' } as any);
      expect((prisma as any).serviceAlias.create).toHaveBeenCalledWith({ data: { serviceId: 's1', alias: 'expenses' } });
      expect(audit.record).toHaveBeenCalledWith('admin1', 'ADMIN_CHANGE', 's1', expect.objectContaining({ action: 'add-alias' }));
    });

    it('removeAlias deletes the row and writes one ADMIN_CHANGE audit row', async () => {
      (prisma as any).serviceAlias = { delete: jest.fn().mockResolvedValue({}) };
      await service.removeAlias('admin1', 's1', 'a1');
      expect((prisma as any).serviceAlias.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
      expect(audit.record).toHaveBeenCalledWith('admin1', 'ADMIN_CHANGE', 's1', expect.objectContaining({ action: 'remove-alias' }));
    });

    it('removeAlias raises NotFoundException (not a 500) when the row does not exist', async () => {
      (prisma as any).serviceAlias = { delete: jest.fn().mockRejectedValue(recordNotFoundError()) };
      await expect(service.removeAlias('admin1', 's1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(audit.record).not.toHaveBeenCalled();
    });
  });
});

/** The error Prisma throws when `delete` targets a row that is not there. */
function recordNotFoundError() {
  return new Prisma.PrismaClientKnownRequestError('Record to delete does not exist.', {
    code: 'P2025',
    clientVersion: '5.10.0',
  });
}
