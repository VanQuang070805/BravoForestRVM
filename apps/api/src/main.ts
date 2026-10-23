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
  const isDevelopmentLanOrigin = (origin: string) => {
    if (process.env.NODE_ENV === 'production') return false;
    try {
      const url = new URL(origin);
      const privateHost = url.hostname === 'localhost'
        || url.hostname === '127.0.0.1'
        || /^10\./.test(url.hostname)
        || /^192\.168\./.test(url.hostname)
        || /^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname);
      return url.protocol === 'http:' && privateHost && ['3000', '3001', '3002'].includes(url.port);
    } catch {
      return false;
    }
  };
  const isOriginAllowed = (origin?: string) => !origin || origins.includes(origin) || isDevelopmentLanOrigin(origin);
  const cors: CorsOptions = {
    origin: (origin, callback) => callback(null, isOriginAllowed(origin)),
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
    if (usesRefreshCookie && request.method === 'POST' && hasRefreshCookie && !isOriginAllowed(origin)) {
      return response.status(403).json({ message: 'Origin rejected' });
    }
    if (usesRefreshCookie && request.method === 'POST' && origin && !isOriginAllowed(origin)) {
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
