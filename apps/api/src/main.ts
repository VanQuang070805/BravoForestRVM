import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(new Logger('BravoForestApi'));
  app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));
  app.use(helmet());
  app.use(cookieParser());

  const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:3001,http://localhost:3002')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const cors: CorsOptions = {
    origin: (origin, callback) => callback(null, !origin || origins.includes(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  };
  app.enableCors(cors);

  // Refresh and logout can authenticate with the HttpOnly cookie, so reject a cross-origin browser request.
  app.use((request: any, response: any, next: () => void) => {
    const usesRefreshCookie = request.path.endsWith('/refresh') || request.path.endsWith('/logout');
    const hasRefreshCookie = Boolean(
      request.cookies?.bf_customer_refresh_token || request.cookies?.bf_admin_refresh_token || request.cookies?.refresh_token,
    );
    const origin = request.headers.origin;
    if (usesRefreshCookie && request.method === 'POST' && hasRefreshCookie && (!origin || !origins.includes(origin))) {
      return response.status(403).json({ message: 'Origin rejected' });
    }
    if (usesRefreshCookie && request.method === 'POST' && origin && !origins.includes(origin)) {
      return response.status(403).json({ message: 'Origin rejected' });
    }
    next();
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.setGlobalPrefix('api/v1');

  if (process.env.NODE_ENV !== 'production') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('BravoForest API')
        .setDescription('Reverse vending, wallet and rewards API')
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/docs-json' });
  }
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 4000), '0.0.0.0');
}

void bootstrap();
