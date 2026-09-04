import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../app.module';

// Uses the seeded CREDENTIAL service "HR Self-Service Portal" (entitled to every EMPLOYEE)
// and the seeded AD password (AD_DEV_PASSWORD, default "dev-ad-password").
describe('POST /vault/credentials/:serviceId/reauth (e2e)', () => {
  let app: INestApplication;
  let prisma: any;
  let hrServiceId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = new (require('@prisma/client').PrismaClient)();
    const svc = await prisma.service.findFirst({ where: { name: 'HR Self-Service Portal' } });
    hrServiceId = svc.id;
  });

  afterEach(async () => {
    const emp = await prisma.user.findUnique({ where: { email: 'finance.employee@launchpad.local' } });
    await prisma.credentialVaultLockout.deleteMany({ where: { userId: emp.id } });
  });

  afterAll(async () => { await prisma.$disconnect(); await app.close(); });

  const login = async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/dev-login').send({ email: 'finance.employee@launchpad.local' });
    return agent;
  };

  it('returns a reauthToken for the correct AD password', async () => {
    const agent = await login();
    const res = await agent.post(`/vault/credentials/${hrServiceId}/reauth`).send({ adPassword: 'dev-ad-password' });
    expect(res.status).toBe(201);
    expect(res.body.reauthToken).toEqual(expect.any(String));
  });

  it('401s for a wrong AD password', async () => {
    const agent = await login();
    const res = await agent.post(`/vault/credentials/${hrServiceId}/reauth`).send({ adPassword: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/wasn't recognized/i);
  });

  it('423s after 5 consecutive wrong passwords, with retryAfterSeconds', async () => {
    const agent = await login();
    let res: any;
    for (let i = 0; i < 5; i++) {
      res = await agent.post(`/vault/credentials/${hrServiceId}/reauth`).send({ adPassword: 'wrong' });
    }
    expect(res.status).toBe(423);
    expect(res.body.retryAfterSeconds).toBeGreaterThan(0);
  });
});
