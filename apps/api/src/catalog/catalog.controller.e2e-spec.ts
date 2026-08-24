import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../app.module';

describe('GET /catalog (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(() => app.close());

  it('returns only the Finance-entitled service for the seeded Finance employee', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ email: 'finance.employee@launchpad.local' });
    const res = await agent.get('/catalog');
    expect(res.status).toBe(200);
    const names = res.body.map((s: any) => s.name);
    expect(names).toContain('Finance Expense System');
    expect(names).not.toContain('Source Code Repository');
    expect(names).not.toContain('Legacy Timesheet Tool');
    expect(names).not.toContain('Unentitled Internal Tool');
  });

  it('returns a distinct catalog for the seeded Engineering employee', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ email: 'eng.employee@launchpad.local' });
    const res = await agent.get('/catalog');
    const names = res.body.map((s: any) => s.name);
    expect(names).toContain('Source Code Repository');
    expect(names).not.toContain('Finance Expense System');
  });

  it('finds "Finance Expense System" via a misspelled query', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ email: 'finance.employee@launchpad.local' });
    const res = await agent.get('/catalog/search').query({ q: 'expence' });
    expect(res.status).toBe(200);
    expect(res.body.map((s: any) => s.name)).toContain('Finance Expense System');
  });

  it('finds a service via its alias', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ email: 'eng.employee@launchpad.local' });
    const res = await agent.get('/catalog/search').query({ q: 'gitlab' });
    expect(res.body.map((s: any) => s.name)).toContain('Source Code Repository');
  });

  it('returns an empty array (not an error) for a query with no matches', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ email: 'eng.employee@launchpad.local' });
    const res = await agent.get('/catalog/search').query({ q: 'zzznomatch' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('GET /catalog/:id and report-issue (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(() => app.close());

  it('returns detail for an entitled service', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ email: 'finance.employee@launchpad.local' });
    const list = await agent.get('/catalog');
    const expenseService = list.body.find((s: any) => s.name === 'Finance Expense System');
    const res = await agent.get(`/catalog/${expenseService.id}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Finance Expense System');
  });

  it('404s for a service the user is not entitled to (does not leak existence via 403)', async () => {
    const financeAgent = request.agent(app.getHttpServer());
    await financeAgent.post('/auth/login').send({ email: 'finance.employee@launchpad.local' });
    const engAgent = request.agent(app.getHttpServer());
    await engAgent.post('/auth/login').send({ email: 'eng.employee@launchpad.local' });
    const engList = await engAgent.get('/catalog');
    const codeRepo = engList.body.find((s: any) => s.name === 'Source Code Repository');
    const res = await financeAgent.get(`/catalog/${codeRepo.id}`);
    expect(res.status).toBe(404);
  });

  it('accepts a report-issue submission', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ email: 'finance.employee@launchpad.local' });
    const list = await agent.get('/catalog');
    const expenseService = list.body.find((s: any) => s.name === 'Finance Expense System');
    const res = await agent.post(`/catalog/${expenseService.id}/report-issue`).send({ description: 'Login link is broken.' });
    expect(res.status).toBe(201);
  });
});

describe('POST /catalog/:id/launch (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(() => app.close());

  it('writes exactly one CATALOG_LAUNCH audit row', async () => {
    const agent = request.agent(app.getHttpServer());
    const login = await agent.post('/auth/login').send({ email: 'finance.employee@launchpad.local' });
    const list = await agent.get('/catalog');
    const service = list.body.find((s: any) => s.name === 'Finance Expense System');

    const prisma = new (require('@prisma/client').PrismaClient)();
    const before = await prisma.auditLog.count({ where: { userId: login.body.id, eventType: 'CATALOG_LAUNCH', serviceId: service.id } });
    await agent.post(`/catalog/${service.id}/launch`).expect(201);
    const after = await prisma.auditLog.count({ where: { userId: login.body.id, eventType: 'CATALOG_LAUNCH', serviceId: service.id } });
    expect(after).toBe(before + 1);
    await prisma.$disconnect();
  });
});
