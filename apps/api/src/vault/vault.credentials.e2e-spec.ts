import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../app.module';

// Uses eng.employee (not finance.employee) so this suite's lockout/credential row
// cleanup never races vault.reauth.e2e-spec.ts, which mutates finance.employee lockout
// state and runs in a parallel Jest worker.
const EMP_EMAIL = 'eng.employee@launchpad.local';

describe('Credential CRUD (e2e)', () => {
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
    await prisma.credentialVaultLockout.deleteMany({ where: { userId: empId } });
    await prisma.auditLog.deleteMany({ where: { userId: empId, eventType: { startsWith: 'CREDENTIAL_' } } });
  });
  afterAll(async () => { await app.close(); await prisma.$disconnect(); });

  const session = async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/dev-login').send({ email: EMP_EMAIL });
    return agent;
  };
  const reauth = async (agent: any) => {
    const r = await agent.post(`/vault/credentials/${hrServiceId}/reauth`).send({ adPassword: 'dev-ad-password' });
    return r.body.reauthToken as string;
  };

  it('GET returns [] with no re-auth token', async () => {
    const agent = await session();
    await agent.get(`/vault/credentials/${hrServiceId}`).expect(200).expect([]);
  });

  it('POST requires a re-auth token', async () => {
    const agent = await session();
    await agent.post(`/vault/credentials/${hrServiceId}`).send({ username: 'jdoe', password: 'pw' }).expect(401);
  });

  it('POST with a token creates a credential (first one is default), and it shows in GET without a password', async () => {
    const agent = await session();
    const token = await reauth(agent);
    const created = await agent
      .post(`/vault/credentials/${hrServiceId}`)
      .set('X-Reauth-Token', token)
      .send({ label: 'Personal', username: 'jdoe', password: 's3cret' })
      .expect(201);
    expect(created.body).toMatchObject({ label: 'Personal', username: 'jdoe', isDefault: true });
    expect(created.body.password).toBeUndefined();

    const list = await agent.get(`/vault/credentials/${hrServiceId}`).expect(200);
    expect(list.body).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain('s3cret');

    const audit = await prisma.auditLog.count({ where: { userId: empId, eventType: 'CREDENTIAL_UPDATE', serviceId: hrServiceId } });
    expect(audit).toBe(1);
  });

  it('a re-auth token is single-use: a second POST with the same token is 401', async () => {
    const agent = await session();
    const token = await reauth(agent);
    await agent.post(`/vault/credentials/${hrServiceId}`).set('X-Reauth-Token', token).send({ username: 'a', password: 'b' }).expect(201);
    await agent.post(`/vault/credentials/${hrServiceId}`).set('X-Reauth-Token', token).send({ username: 'c', password: 'd' }).expect(401);
  });

  it('PATCH updates a credential and DELETE removes it, both requiring a fresh token each', async () => {
    const agent = await session();
    let token = await reauth(agent);
    const c = await agent.post(`/vault/credentials/${hrServiceId}`).set('X-Reauth-Token', token).send({ username: 'u', password: 'p' }).expect(201);

    token = await reauth(agent);
    await agent.patch(`/vault/credentials/${hrServiceId}/${c.body.id}`).set('X-Reauth-Token', token).send({ label: 'Renamed' }).expect(200);

    token = await reauth(agent);
    await agent.delete(`/vault/credentials/${hrServiceId}/${c.body.id}`).set('X-Reauth-Token', token).expect(204);
    await agent.get(`/vault/credentials/${hrServiceId}`).expect(200).expect([]);
  });

  it('PATCH .../default needs no re-auth token and moves the default flag', async () => {
    const agent = await session();
    let token = await reauth(agent);
    const a = await agent.post(`/vault/credentials/${hrServiceId}`).set('X-Reauth-Token', token).send({ label: 'A', username: 'a', password: 'a' }).expect(201);
    token = await reauth(agent);
    const b = await agent.post(`/vault/credentials/${hrServiceId}`).set('X-Reauth-Token', token).send({ label: 'B', username: 'b', password: 'b' }).expect(201);
    expect(a.body.isDefault).toBe(true);
    expect(b.body.isDefault).toBe(false);

    await agent.patch(`/vault/credentials/${hrServiceId}/${b.body.id}/default`).expect(204);
    const list = await agent.get(`/vault/credentials/${hrServiceId}`).expect(200);
    expect(list.body.find((x: any) => x.id === b.body.id).isDefault).toBe(true);
    expect(list.body.find((x: any) => x.id === a.body.id).isDefault).toBe(false);
  });
});
