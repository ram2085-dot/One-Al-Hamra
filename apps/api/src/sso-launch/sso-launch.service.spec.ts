import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { SsoLaunchService } from './sso-launch.service';
import { CatalogService } from '../catalog/catalog.service';
import { AuditService } from '../audit/audit.service';

describe('SsoLaunchService', () => {
  let service: SsoLaunchService;
  const catalogService = { assertEntitled: jest.fn() };
  const auditService = { record: jest.fn() };
  const config = {
    get: (key: string) =>
      ({ DEMO_APP_A_URL: 'http://localhost:4001/login', DEMO_APP_B_URL: 'http://localhost:4002/login' }[key]),
  };
  const user = { id: 'u1' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        SsoLaunchService,
        { provide: CatalogService, useValue: catalogService },
        { provide: AuditService, useValue: auditService },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    service = moduleRef.get(SsoLaunchService);
  });

  it('resolves DEMO_APP_A to its configured URL and writes an SSO_LAUNCH audit row', async () => {
    catalogService.assertEntitled.mockResolvedValue({ id: 's1', ssoTargetApp: 'DEMO_APP_A' });
    const result = await service.resolve(user, 's1');
    expect(result).toEqual({ redirectUrl: 'http://localhost:4001/login' });
    expect(auditService.record).toHaveBeenCalledWith('u1', 'SSO_LAUNCH', 's1');
  });

  it('resolves DEMO_APP_B to its configured URL', async () => {
    catalogService.assertEntitled.mockResolvedValue({ id: 's2', ssoTargetApp: 'DEMO_APP_B' });
    const result = await service.resolve(user, 's2');
    expect(result).toEqual({ redirectUrl: 'http://localhost:4002/login' });
  });

  it('throws a clear error when the service has no ssoTargetApp configured', async () => {
    catalogService.assertEntitled.mockResolvedValue({ id: 's3', ssoTargetApp: null });
    await expect(service.resolve(user, 's3')).rejects.toThrow(BadRequestException);
    expect(auditService.record).not.toHaveBeenCalled();
  });
});
