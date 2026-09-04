import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Fail fast on a clean checkout that never copied apps/api/.env.example to .env — otherwise a
  // missing var surfaces later as an opaque 500 from the credential-launch / vault paths.
  // ConfigModule.forRoot has loaded .env into process.env by this point. Never log the values.
  const required = ['CREDENTIAL_VAULT_KEY', 'AD_DEV_PASSWORD', 'LEGACY_APP_LOGIN_URL', 'API_BASE_URL'];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required env var(s): ${missing.join(', ')}. Copy apps/api/.env.example to apps/api/.env.`,
    );
  }

  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: 'http://localhost:5173', credentials: true });
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
