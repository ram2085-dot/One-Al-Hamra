import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../app.module';

// Uses eng.employee (not finance.employee) so this suite's successful reauth never
// resets finance.employee's failure count mid-run — vault.reauth.e2e-spec.ts asserts a
// 5-strikes 423 lockout for finance.employee from a parallel Jest worker.
const EMP_EMAIL = 'eng.employee@launchpad.local';

describe('credential-launch inject page (e2e)', () => {
  let app: INestApplication;
  let prisma: any;
  let hrServiceId: string;
  let empId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = new (require('@prisma/client').PrismaClient)();
    hrServiceId = (await prisma.service.findFirst({ where: { name: 'HR Self-Service Portal' } })).id;
    empId = (await prisma.user.findUnique({ where: { email: EMP_EMAIL } })).id;
  });
  afterEach(async () => {
    await prisma.credential.deleteMany({ where: { userId: empId } });
    await prisma.auditLog.deleteMany({ where: { userId: empId, eventType: { startsWith: 'CREDENTIAL_' } } });
    await prisma.credentialVaultLockout.deleteMany({ where: { userId: empId } });
  });
  afterAll(async () => { await app.close(); await prisma.$disconnect(); });

  it('POST launch → GET inject returns an auto-submit form, no-store, once', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/dev-login').send({ email: EMP_EMAIL });
    const token = (await agent.post(`/vault/credentials/${hrServiceId}/reauth`).send({ adPassword: 'dev-ad-password' })).body.reauthToken;
    await agent.post(`/vault/credentials/${hrServiceId}`).set('X-Reauth-Token', token).send({ username: 'hruser', password: 'hr-pw-123' }).expect(201);

    const launch = await agent.post(`/credential-launch/${hrServiceId}`).send({}).expect(201);
    const injectPath = launch.body.injectUrl.replace(/^https?:\/\/[^/]+/, '');

    const page = await request(app.getHttpServer()).get(injectPath).expect(200);
    expect(page.headers['cache-control']).toContain('no-store');
    expect(page.text).toContain('<form');
    expect(page.text).toContain('method="post"');
    expect(page.text).toContain('name="username"');
    expect(page.text).toContain('hruser');

    await request(app.getHttpServer()).get(injectPath).expect(410); // single-use
  });

  it('an unknown token yields a 410 plain-language page', async () => {
    const res = await request(app.getHttpServer()).get('/credential-launch/inject/deadbeef').expect(410);
    expect(res.text).toMatch(/help desk/i);
    expect(res.text).not.toMatch(/stack|Error:/);
  });
});
