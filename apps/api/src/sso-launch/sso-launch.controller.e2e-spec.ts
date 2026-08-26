// apps/api/src/sso-launch/sso-launch.controller.e2e-spec.ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../app.module';

describe('GET /sso-launch/:serviceId (e2e)', () => {
  let app: INestApplication;
  const createdServiceIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    if (createdServiceIds.length > 0) {
      const prisma = new (require('@prisma/client').PrismaClient)();
      await prisma.auditLog.deleteMany({ where: { serviceId: { in: createdServiceIds } } });
      await prisma.service.deleteMany({ where: { id: { in: createdServiceIds } } });
      await prisma.$disconnect();
    }
    await app.close();
  });

  it('returns the demo app A URL for an entitled SSO service configured for it', async () => {
    const adminAgent = request.agent(app.getHttpServer());
    const adminLogin = await adminAgent.post('/auth/dev-login').send({ email: 'admin@launchpad.local' });
    const created = await adminAgent.post('/admin/services').send({
      name: 'SSO Launch Test Svc', description: 'd', category: 'IT', tags: [],
      ownerId: adminLogin.body.id, launchType: 'SSO', supportContact: 'x@y.com',
    });
    createdServiceIds.push(created.body.id);
    await adminAgent.post(`/admin/services/${created.body.id}/entitlements`).send({ role: 'EMPLOYEE' });
    await adminAgent.patch(`/admin/services/${created.body.id}`).send({ ssoTargetApp: 'DEMO_APP_A' }).expect(200);

    const empAgent = request.agent(app.getHttpServer());
    await empAgent.post('/auth/dev-login').send({ email: 'finance.employee@launchpad.local' });
    const res = await empAgent.get(`/sso-launch/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ redirectUrl: 'http://localhost:4001/login' });
  });

  it('404s for a service the user is not entitled to (same as /catalog/:id)', async () => {
    const adminAgent = request.agent(app.getHttpServer());
    const adminLogin = await adminAgent.post('/auth/dev-login').send({ email: 'admin@launchpad.local' });
    const created = await adminAgent.post('/admin/services').send({
      name: 'SSO Entitlement Test Svc', description: 'd', category: 'IT', tags: [],
      ownerId: adminLogin.body.id, launchType: 'SSO', supportContact: 'x@y.com',
    });
    createdServiceIds.push(created.body.id);
    await adminAgent.patch(`/admin/services/${created.body.id}`).send({ ssoTargetApp: 'DEMO_APP_A' });
    // deliberately no entitlement added — zero entitlements means invisible to non-admins

    const empAgent = request.agent(app.getHttpServer());
    await empAgent.post('/auth/dev-login').send({ email: 'finance.employee@launchpad.local' });
    await empAgent.get(`/sso-launch/${created.body.id}`).expect(404);
  });

  it('400s with a clear message for an SSO service with no ssoTargetApp set', async () => {
    const adminAgent = request.agent(app.getHttpServer());
    const adminLogin = await adminAgent.post('/auth/dev-login').send({ email: 'admin@launchpad.local' });
    const created = await adminAgent.post('/admin/services').send({
      name: 'Unconfigured SSO Svc', description: 'd', category: 'IT', tags: [],
      ownerId: adminLogin.body.id, launchType: 'SSO', supportContact: 'x@y.com',
    });
    createdServiceIds.push(created.body.id);
    await adminAgent.post(`/admin/services/${created.body.id}/entitlements`).send({ role: 'EMPLOYEE' });

    const empAgent = request.agent(app.getHttpServer());
    await empAgent.post('/auth/dev-login').send({ email: 'finance.employee@launchpad.local' });
    const res = await empAgent.get(`/sso-launch/${created.body.id}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/isn't configured for SSO launch/i);
  });
});
