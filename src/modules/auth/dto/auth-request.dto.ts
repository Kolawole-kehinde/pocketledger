import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterRequestDto {
  @ApiProperty({
    format: 'email',
    maxLength: 255,
    example: 'jane.doe@example.com',
    description: 'Email address that will receive the OTP.',
  })
  email: string;
}

export class LoginRequestDto {
  @ApiProperty({
    format: 'email',
    maxLength: 255,
    example: 'jane.doe@example.com',
    description: 'Email address associated with the account.',
  })
  email: string;
}

export class VerifyOtpRequestDto {
  @ApiProperty({
    format: 'email',
    maxLength: 255,
    example: 'jane.doe@example.com',
  })
  email: string;

  @ApiProperty({
    type: String,
    pattern: '^\\d{6}$',
    minLength: 6,
    maxLength: 6,
    example: '123456',
    description: 'Six digit one-time password.',
  })
  otp: string;
}

export class CompleteRegistrationRequestDto {
  @ApiProperty({
    minLength: 1,
    maxLength: 100,
    example: 'Jane',
  })
  firstName: string;

  @ApiProperty({
    minLength: 1,
    maxLength: 100,
    example: 'Doe',
  })
  lastName: string;

  @ApiPropertyOptional({
    maxLength: 100,
    nullable: true,
    example: 'A.',
  })
  middleName?: string | null;

  @ApiProperty({
    minLength: 3,
    maxLength: 30,
    pattern: '^[a-zA-Z0-9_.-]+$',
    example: 'jane.doe',
    description:
      'Unique username. Letters, numbers, underscores, dots and hyphens only.',
  })
  username: string;

  @ApiProperty({
    pattern: '^\\+?[0-9]{7,20}$',
    example: '+2348012345678',
    description: 'Unique phone number in international format.',
  })
  phoneNumber: string;
}

export class RegistrationTokenResponseDto {
  @ApiProperty({
    description:
      'Short-lived token used to authorize the registration completion call.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  registrationToken: string;

  @ApiProperty({
    description: 'Registration token lifetime in seconds.',
    example: 900,
  })
  expiresInSeconds: number;
}
