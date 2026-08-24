import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../app.module';

describe('/admin/services RBAC (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(() => app.close());

  it('rejects a non-admin employee with 403', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ email: 'finance.employee@launchpad.local' });
    await agent.get('/admin/services').expect(403);
  });

  it('allows CATALOG_ADMIN and returns retired/inactive services too', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ email: 'admin@launchpad.local' });
    const res = await agent.get('/admin/services');
    expect(res.status).toBe(200);
    expect(res.body.map((s: any) => s.name)).toContain('Legacy Timesheet Tool');
  });

  it('admin create produces exactly one ADMIN_CHANGE audit row', async () => {
    const agent = request.agent(app.getHttpServer());
    const login = await agent.post('/auth/login').send({ email: 'admin@launchpad.local' });
    const prisma = new (require('@prisma/client').PrismaClient)();
    const before = await prisma.auditLog.count({ where: { userId: login.body.id, eventType: 'ADMIN_CHANGE' } });
    await agent.post('/admin/services').send({
      name: 'Test Service', description: 'd', category: 'IT', tags: [], ownerId: login.body.id,
      launchType: 'SSO', supportContact: 'x@y.com',
    }).expect(201);
    const after = await prisma.auditLog.count({ where: { userId: login.body.id, eventType: 'ADMIN_CHANGE' } });
    expect(after).toBe(before + 1);
    await prisma.$disconnect();
  });
});
