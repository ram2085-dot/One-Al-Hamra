import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../../app.module';

describe('AuthGuard (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterAll(() => app.close());

  it('rejects an unauthenticated request to a protected route with 401', async () => {
    await request(app.getHttpServer()).get('/catalog').expect(401);
  });

  it('allows /auth/login without a session', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@launchpad.local' });
    expect(res.status).toBe(200);
  });

  it('GET /auth/me returns the safe user projection for a live session', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ email: 'finance.employee@launchpad.local' });
    const res = await agent.get('/auth/me');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: expect.any(String),
      email: 'finance.employee@launchpad.local',
      displayName: 'Finn Ance',
      department: 'Finance',
      role: 'EMPLOYEE',
    });
    expect(res.body.adUsername).toBeUndefined();
  });

  it('GET /auth/me 401s without a session cookie (the logged-out case the client expects)', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });
});
