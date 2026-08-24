import { Test } from '@nestjs/testing';
import { AuditService } from './audit.service';
import { PrismaService } from '../common/prisma.service';

describe('AuditService', () => {
  let service: AuditService;
  const prisma = { auditLog: { create: jest.fn() } };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [AuditService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(AuditService);
  });

  it('writes exactly one AuditLog row with the given fields', async () => {
    await service.record('u1', 'CATALOG_LAUNCH', 's1', { via: 'tile-click' });
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: { userId: 'u1', eventType: 'CATALOG_LAUNCH', serviceId: 's1', metadata: { via: 'tile-click' } },
    });
  });

  it('supports events with no serviceId (e.g. future admin events on non-service entities)', async () => {
    await service.record('u1', 'ADMIN_CHANGE', undefined, { note: 'test' });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: { userId: 'u1', eventType: 'ADMIN_CHANGE', serviceId: undefined, metadata: { note: 'test' } },
    });
  });
});
