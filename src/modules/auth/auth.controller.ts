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
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  ErrorResponseDto,
  RateLimitErrorResponseDto,
} from '../../common/dto/error-response.dto.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { AuthenticatedUser } from '../authorization/authorization.types.js';
import { CurrentUser } from '../authorization/decorators/current-user.decorator.js';
import { Public } from '../authorization/decorators/public.decorator.js';
import { RequirePermissions } from '../authorization/decorators/permissions.decorator.js';
import { PERMISSIONS } from '../authorization/permissions.js';
import { AUTH_MESSAGES } from './auth.constants.js';
import {
  CompleteRegistrationRequestDto,
  LoginRequestDto,
  RegisterRequestDto,
  RegistrationTokenResponseDto,
  VerifyOtpRequestDto,
} from './dto/auth-request.dto.js';
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

@ApiTags('Auth')
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
  @ApiOperation({
    summary: 'Start registration',
    description:
      'Sends a six digit OTP to the supplied email address. Repeating the ' +
      'request resends the OTP once the resend cooldown has elapsed. The ' +
      'response is intentionally vague so it does not reveal whether the ' +
      'email can be registered.',
  })
  @ApiBody({ type: RegisterRequestDto })
  @ApiOkResponse({
    type: OtpRequestedResponseDto,
    description: 'Registration request accepted and an OTP was queued.',
  })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'The request body is invalid.',
  })
  @ApiTooManyRequestsResponse({
    type: RateLimitErrorResponseDto,
    description: 'Registration rate limit exceeded for this IP or email.',
  })
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
  @ApiOperation({
    summary: 'Verify the registration OTP',
    description:
      'Exchanges a valid OTP for a short-lived registration token used by ' +
      '`POST /auth/register/complete`.',
  })
  @ApiBody({ type: VerifyOtpRequestDto })
  @ApiOkResponse({
    type: RegistrationTokenResponseDto,
    description: 'OTP verified and a registration token was issued.',
  })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description:
      'The OTP is invalid, expired, already used, or the attempt limit was exceeded.',
  })
  @ApiTooManyRequestsResponse({
    type: RateLimitErrorResponseDto,
    description: 'OTP verification rate limit exceeded for this IP or email.',
  })
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
  @ApiOperation({
    summary: 'Complete registration',
    description:
      'Creates the customer account and returns an access token. The refresh ' +
      'token is set as an HttpOnly cookie. Requires the short-lived ' +
      'registration token returned by `POST /auth/register/verify`. Click ' +
      '**Authorize** and paste the token into the `registration-token` field; ' +
      'Swagger adds the `Bearer` prefix for you.',
  })
  @ApiBearerAuth('registration-token')
  @ApiBody({ type: CompleteRegistrationRequestDto })
  @ApiOkResponse({
    type: AuthTokenResponseDto,
    description:
      'Account created. The access token is returned in the body and the ' +
      'refresh token is set in the `pocketledger_refresh` cookie.',
  })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'The request body is invalid.',
  })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description:
      'Missing or invalid registration token (`INVALID_REGISTRATION_TOKEN`), ' +
      'an expired registration token (`REGISTRATION_TOKEN_EXPIRED`), or an ' +
      'expired registration session (`REGISTRATION_EXPIRED`). Verify the OTP ' +
      'again to obtain a fresh token.',
  })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'The username, phone number, or email is already in use.',
  })
  @ApiTooManyRequestsResponse({
    type: RateLimitErrorResponseDto,
    description: 'Registration completion rate limit exceeded for this IP.',
  })
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
  @ApiOperation({
    summary: 'Start login',
    description:
      'Sends a six digit OTP to the supplied email address. The response is ' +
      'intentionally vague so it does not reveal whether an account exists.',
  })
  @ApiBody({ type: LoginRequestDto })
  @ApiOkResponse({
    type: OtpRequestedResponseDto,
    description: 'Login request accepted and an OTP was queued.',
  })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'The request body is invalid.',
  })
  @ApiTooManyRequestsResponse({
    type: RateLimitErrorResponseDto,
    description: 'Login rate limit exceeded for this IP or email.',
  })
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
  @ApiOperation({
    summary: 'Verify the login OTP',
    description:
      'Exchanges a valid OTP for an access token. The refresh token is set as ' +
      'an HttpOnly cookie.',
  })
  @ApiBody({ type: VerifyOtpRequestDto })
  @ApiOkResponse({
    type: AuthTokenResponseDto,
    description:
      'Login successful. The access token is returned in the body and the ' +
      'refresh token is set in the `pocketledger_refresh` cookie.',
  })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description:
      'The OTP is invalid, expired, already used, or the attempt limit was exceeded.',
  })
  @ApiForbiddenResponse({
    type: ErrorResponseDto,
    description: 'The account is not available for sign in.',
  })
  @ApiTooManyRequestsResponse({
    type: RateLimitErrorResponseDto,
    description: 'OTP verification rate limit exceeded for this IP or email.',
  })
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
  @ApiOperation({
    summary: 'Rotate the refresh token',
    description:
      'Reads the refresh token from the `pocketledger_refresh` HttpOnly cookie ' +
      'and returns a new access token. The refresh token is rotated on every ' +
      'successful call. In Swagger UI, sign in first so the browser holds the ' +
      'cookie before trying this endpoint.',
  })
  @ApiCookieAuth('refresh-cookie')
  @ApiOkResponse({
    type: AuthTokenResponseDto,
    description:
      'Tokens rotated. The new refresh token is set in the ' +
      '`pocketledger_refresh` cookie.',
  })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'Missing, invalid or expired refresh token cookie.',
  })
  @ApiTooManyRequestsResponse({
    type: RateLimitErrorResponseDto,
    description: 'Refresh rate limit exceeded for this IP.',
  })
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
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Sign out the current session',
    description:
      'Revokes the current session and clears the refresh token cookie.',
  })
  @ApiOkResponse({
    type: MessageResponseDto,
    description: 'The current session was revoked.',
  })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'Missing or invalid access token.',
  })
  @ApiForbiddenResponse({
    type: ErrorResponseDto,
    description: 'The caller lacks the `sessions:revoke` permission.',
  })
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
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Sign out of all sessions',
    description:
      'Revokes every active session for the authenticated user and clears ' +
      'the refresh token cookie.',
  })
  @ApiOkResponse({
    type: MessageResponseDto,
    description: 'All sessions for the user were revoked.',
  })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'Missing or invalid access token.',
  })
  @ApiForbiddenResponse({
    type: ErrorResponseDto,
    description: 'The caller lacks the `sessions:revoke` permission.',
  })
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
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'List the active sessions',
    description:
      'Returns the authenticated user’s active sessions, newest first. The ' +
      '`current` flag marks the session making this request.',
  })
  @ApiOkResponse({
    type: SessionResponseDto,
    isArray: true,
    description: 'Active sessions for the authenticated user.',
  })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'Missing or invalid access token.',
  })
  @ApiForbiddenResponse({
    type: ErrorResponseDto,
    description: 'The caller lacks the `sessions:read` permission.',
  })
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
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Revoke a session',
    description: 'Revokes a specific session owned by the authenticated user.',
  })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    description: 'Session id.',
    example: '5b0f2b7c-1f4e-4f8a-9d2c-7e6a1b3c4d5e',
  })
  @ApiOkResponse({
    type: MessageResponseDto,
    description: 'The session was revoked.',
  })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'Missing or invalid access token.',
  })
  @ApiForbiddenResponse({
    type: ErrorResponseDto,
    description:
      'The caller lacks the `sessions:revoke` permission or does not own the session.',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Session not found.',
  })
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
