import { Test } from '@nestjs/testing';
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
});
