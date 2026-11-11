import type { INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

const ACCESS_TOKEN_SECURITY = 'access-token';
const REGISTRATION_TOKEN_SECURITY = 'registration-token';
const REFRESH_COOKIE_SECURITY = 'refresh-cookie';

function isSwaggerEnabled(configService: ConfigService): boolean {
  const configured = configService.get<boolean>('SWAGGER_ENABLED');

  if (configured !== undefined) {
    return configured;
  }

  // Documentation is exposed by default outside production so the generated
  // OpenAPI contract stays reachable in preview and staging environments.
  return configService.get<string>('NODE_ENV') !== 'production';
}

export function setupSwagger(
  app: INestApplication,
  configService: ConfigService,
): string | null {
  if (!isSwaggerEnabled(configService)) {
    return null;
  }

  const path = configService.get<string>('SWAGGER_PATH') ?? 'docs';

  const config = new DocumentBuilder()
    .setTitle('PocketLedger API')
    .setDescription(
      'PocketLedger core API. Authentication uses short-lived JWT access ' +
        'tokens sent as `Authorization: Bearer <token>` headers; refresh ' +
        'tokens are delivered as an HttpOnly cookie.',
    )
    .setVersion('1.0.0')
    .addServer(
      `http://localhost:${configService.get<number>('PORT') ?? 3000}`,
      'Local development',
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Short-lived JWT access token.',
      },
      ACCESS_TOKEN_SECURITY,
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'Short-lived registration token returned by ' +
          '`POST /auth/register/verify`.',
      },
      REGISTRATION_TOKEN_SECURITY,
    )
    .addCookieAuth(
      configService.get<string>('AUTH_COOKIE_NAME') ??
        'pocketledger_refresh',
      {
        type: 'apiKey',
        in: 'cookie',
        description: 'HttpOnly refresh token cookie.',
      },
      REFRESH_COOKIE_SECURITY,
    )
    .addTag('Auth', 'Registration, login, sessions and token lifecycle')
    .addTag('Users', 'Profile and user administration')
    .addTag('Security Events', 'Security event monitoring and triage')
    .addTag('Health', 'Service health')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup(path, app, document, {
    customSiteTitle: 'PocketLedger API Docs',
    jsonDocumentUrl: `${path}/openapi.json`,
    yamlDocumentUrl: `${path}/openapi.yaml`,
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
    },
  });

  return path;
}
