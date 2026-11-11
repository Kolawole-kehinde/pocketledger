import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { AuthenticatedUser } from '../authorization/authorization.types.js';
import { CurrentUser } from '../authorization/decorators/current-user.decorator.js';
import { Public } from '../authorization/decorators/public.decorator.js';
import { RequirePermissions } from '../authorization/decorators/permissions.decorator.js';
import { PERMISSIONS } from '../authorization/permissions.js';
import { AUTH_MESSAGES } from './auth.constants.js';
import {
  AuthTokenResponseDto,
  MessageResponseDto,
  OtpRequestedResponseDto,
  SessionResponseDto,
} from './dto/auth-response.dto.js';
import {
  completeRegistrationSchema,
  loginSchema,
  registerSchema,
  sessionIdParamSchema,
  verifyOtpSchema,
  type CompleteRegistrationInput,
  type LoginInput,
  type RegisterInput,
  type VerifyOtpInput,
} from './schemas/auth.schemas.js';
import { LoginService } from './services/login.service.js';
import { RegistrationService } from './services/registration.service.js';
import { SessionService } from './services/session.service.js';
import { TokenService } from './services/token.service.js';
import { authUnauthorized } from './utils/auth-errors.js';
import {
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from './utils/auth-cookie.js';
import {
  extractRegistrationToken,
  getRequestMetadata,
} from './utils/request-metadata.js';

type RequestWithCookies = Request & {
  cookies?: Record<string, string | undefined>;
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly configService: ConfigService,
    private readonly registrationService: RegistrationService,
    private readonly loginService: LoginService,
    private readonly sessionService: SessionService,
    private readonly tokenService: TokenService,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.OK)
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Req() request: Request,
  ): Promise<OtpRequestedResponseDto> {
    return this.registrationService.requestRegistration(
      body.email,
      getRequestMetadata(request),
    );
  }

  @Public()
  @Post('register/verify')
  @HttpCode(HttpStatus.OK)
  async verifyRegistrationOtp(
    @Body(new ZodValidationPipe(verifyOtpSchema))
    body: VerifyOtpInput,
    @Req() request: Request,
  ): Promise<{ registrationToken: string; expiresInSeconds: number }> {
    return this.registrationService.verifyRegistrationOtp(
      body.email,
      body.otp,
      getRequestMetadata(request),
    );
  }

  @Public()
  @Post('register/complete')
  @HttpCode(HttpStatus.OK)
  async completeRegistration(
    @Body(new ZodValidationPipe(completeRegistrationSchema))
    body: CompleteRegistrationInput,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthTokenResponseDto> {
    const registrationToken = extractRegistrationToken(
      request.headers.authorization,
    );

    if (!registrationToken) {
      throw authUnauthorized(
        'INVALID_REGISTRATION_TOKEN',
        AUTH_MESSAGES.invalidRegistrationToken,
      );
    }

    const result = await this.registrationService.completeRegistration(
      registrationToken,
      body,
      getRequestMetadata(request),
    );

    setRefreshCookie(
      response,
      this.configService,
      result.refreshToken,
      this.tokenService.getRefreshTokenTtlSeconds(),
    );

    return new AuthTokenResponseDto({
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      user: result.user,
    });
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() request: Request,
  ): Promise<OtpRequestedResponseDto> {
    return this.loginService.requestLogin(
      body.email,
      getRequestMetadata(request),
    );
  }

  @Public()
  @Post('login/verify')
  @HttpCode(HttpStatus.OK)
  async verifyLoginOtp(
    @Body(new ZodValidationPipe(verifyOtpSchema))
    body: VerifyOtpInput,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthTokenResponseDto> {
    const result = await this.loginService.verifyLoginOtp(
      body.email,
      body.otp,
      getRequestMetadata(request),
    );

    setRefreshCookie(
      response,
      this.configService,
      result.refreshToken,
      this.tokenService.getRefreshTokenTtlSeconds(),
    );

    return new AuthTokenResponseDto({
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      user: result.user,
    });
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: RequestWithCookies,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthTokenResponseDto> {
    const refreshToken = readRefreshCookie(request.cookies, this.configService);

    if (!refreshToken) {
      clearRefreshCookie(response, this.configService);

      throw authUnauthorized(
        'INVALID_REFRESH_TOKEN',
        AUTH_MESSAGES.invalidRefreshToken,
      );
    }

    try {
      const result = await this.sessionService.rotateRefreshToken(
        refreshToken,
        getRequestMetadata(request),
      );

      setRefreshCookie(
        response,
        this.configService,
        result.refreshToken,
        this.tokenService.getRefreshTokenTtlSeconds(),
      );

      return new AuthTokenResponseDto({
        accessToken: result.accessToken,
        expiresIn: result.expiresIn,
        user: result.user,
      });
    } catch (error) {
      clearRefreshCookie(response, this.configService);

      throw error;
    }
  }

  @Post('logout')
  @RequirePermissions(PERMISSIONS.SESSIONS_REVOKE)
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MessageResponseDto> {
    await this.sessionService.logout(
      user.sub,
      user.sessionId,
      getRequestMetadata(request),
      user.jti,
    );

    clearRefreshCookie(response, this.configService);

    return new MessageResponseDto('You have been signed out');
  }

  @Post('logout-all')
  @RequirePermissions(PERMISSIONS.SESSIONS_REVOKE)
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MessageResponseDto> {
    await this.sessionService.logoutAll(user.sub, getRequestMetadata(request), {
      sessionId: user.sessionId,
      jti: user.jti,
    });

    clearRefreshCookie(response, this.configService);

    return new MessageResponseDto('You have been signed out of all sessions');
  }

  @Get('sessions')
  @RequirePermissions(PERMISSIONS.SESSIONS_READ)
  async listSessions(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SessionResponseDto[]> {
    const sessions = await this.sessionService.listSessions(user.sub);

    return sessions.map(
      (session) => new SessionResponseDto(session, user.sessionId),
    );
  }

  @Delete('sessions/:id')
  @RequirePermissions(PERMISSIONS.SESSIONS_REVOKE)
  @HttpCode(HttpStatus.OK)
  async revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(sessionIdParamSchema))
    sessionId: string,
    @Req() request: Request,
  ): Promise<MessageResponseDto> {
    await this.sessionService.revokeSession(
      user.sub,
      sessionId,
      getRequestMetadata(request),
      { sessionId: user.sessionId, jti: user.jti },
    );

    return new MessageResponseDto('Session revoked');
  }
}
