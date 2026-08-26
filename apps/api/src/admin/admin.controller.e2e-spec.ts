import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../app.module';

describe('/admin/services RBAC (e2e)', () => {
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
    await deleteServices(createdServiceIds);
    await app.close();
  });

  it('rejects a non-admin employee with 403', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/dev-login').send({ email: 'finance.employee@launchpad.local' });
    await agent.get('/admin/services').expect(403);
  });

  it('allows CATALOG_ADMIN and returns retired/inactive services too', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/dev-login').send({ email: 'admin@launchpad.local' });
    const res = await agent.get('/admin/services');
    expect(res.status).toBe(200);
    expect(res.body.map((s: any) => s.name)).toContain('Legacy Timesheet Tool');
  });

  it('includes each service\'s entitlements and aliases so the console can list/remove them', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/dev-login').send({ email: 'admin@launchpad.local' });
    const res = await agent.get('/admin/services');
    const expenseSystem = res.body.find((s: any) => s.name === 'Finance Expense System');
    expect(expenseSystem.entitlements.map((e: any) => e.department)).toContain('Finance');
    expect(expenseSystem.aliases.map((a: any) => a.alias)).toEqual(expect.arrayContaining(['expenses', 'concur']));
    expect(expenseSystem.entitlements.every((e: any) => typeof e.id === 'string')).toBe(true);
  });

  it('admin create produces exactly one ADMIN_CHANGE audit row', async () => {
    const agent = request.agent(app.getHttpServer());
    const login = await agent.post('/auth/dev-login').send({ email: 'admin@launchpad.local' });
    const prisma = new (require('@prisma/client').PrismaClient)();
    const before = await prisma.auditLog.count({ where: { userId: login.body.id, eventType: 'ADMIN_CHANGE' } });
    const created = await agent.post('/admin/services').send({
      name: 'Test Service', description: 'd', category: 'IT', tags: [], ownerId: login.body.id,
      launchType: 'SSO', supportContact: 'x@y.com',
    }).expect(201);
    createdServiceIds.push(created.body.id);
    const after = await prisma.auditLog.count({ where: { userId: login.body.id, eventType: 'ADMIN_CHANGE' } });
    expect(after).toBe(before + 1);
    await prisma.$disconnect();
  });

  it('removing a non-existent entitlement 404s rather than 500ing', async () => {
    const agent = request.agent(app.getHttpServer());
    const login = await agent.post('/auth/dev-login').send({ email: 'admin@launchpad.local' });
    const created = await agent.post('/admin/services').send({
      name: 'Delete Guard Svc', description: 'd', category: 'IT', tags: [], ownerId: login.body.id,
      launchType: 'SSO', supportContact: 'x@y.com',
    }).expect(201);
    createdServiceIds.push(created.body.id);
    await agent
      .delete(`/admin/services/${created.body.id}/entitlements/00000000-0000-0000-0000-000000000000`)
      .expect(404);
    await agent
      .delete(`/admin/services/${created.body.id}/aliases/00000000-0000-0000-0000-000000000000`)
      .expect(404);
  });
});

describe('entitlement changes propagate immediately', () => {
  let app: INestApplication;
  const createdServiceIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  // Without this cleanup the suite is not re-runnable: a second run would find the previous run's
  // service already visible and fail the `not.toContain` assertion before the entitlement is added.
  afterAll(async () => {
    await deleteServices(createdServiceIds);
    await app.close();
  });

  it('a newly entitled user sees the service in /catalog without any restart', async () => {
    const adminAgent = request.agent(app.getHttpServer());
    const adminLogin = await adminAgent.post('/auth/dev-login').send({ email: 'admin@launchpad.local' });
    const created = await adminAgent.post('/admin/services').send({
      name: 'Propagation Test Svc', description: 'd', category: 'IT', tags: [],
      ownerId: adminLogin.body.id,
      launchType: 'SSO', supportContact: 'x@y.com',
    });
    createdServiceIds.push(created.body.id);

    const engAgent = request.agent(app.getHttpServer());
    await engAgent.post('/auth/dev-login').send({ email: 'eng.employee@launchpad.local' });
    const before = await engAgent.get('/catalog');
    expect(before.body.map((s: any) => s.name)).not.toContain('Propagation Test Svc');

    await adminAgent.post(`/admin/services/${created.body.id}/entitlements`).send({ department: 'Engineering' }).expect(201);

    const after = await engAgent.get('/catalog');
    expect(after.body.map((s: any) => s.name)).toContain('Propagation Test Svc');
  });

  it('a row with both department and role set requires BOTH to match (spec §6 AND-within-row)', async () => {
    const adminAgent = request.agent(app.getHttpServer());
    const adminLogin = await adminAgent.post('/auth/dev-login').send({ email: 'admin@launchpad.local' });
    const created = await adminAgent.post('/admin/services').send({
      name: 'AND Row Test Svc', description: 'd', category: 'IT', tags: [],
      ownerId: adminLogin.body.id,
      launchType: 'SSO', supportContact: 'x@y.com',
    });
    createdServiceIds.push(created.body.id);

    // "Engineering service owners only" — the seeded Engineering user is a plain EMPLOYEE.
    await adminAgent
      .post(`/admin/services/${created.body.id}/entitlements`)
      .send({ department: 'Engineering', role: 'SERVICE_OWNER' })
      .expect(201);

    const engAgent = request.agent(app.getHttpServer());
    await engAgent.post('/auth/dev-login').send({ email: 'eng.employee@launchpad.local' });
    const res = await engAgent.get('/catalog');
    expect(res.body.map((s: any) => s.name)).not.toContain('AND Row Test Svc');
    expect((await engAgent.get(`/catalog/${created.body.id}`)).status).toBe(404);
  });
});

/** Direct Prisma cleanup; cascades remove the services' entitlements, aliases, and favorites. */
async function deleteServices(ids: string[]) {
  if (ids.length === 0) return;
  const prisma = new (require('@prisma/client').PrismaClient)();
  await prisma.auditLog.deleteMany({ where: { serviceId: { in: ids } } });
  await prisma.service.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
}
