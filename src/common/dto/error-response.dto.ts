import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ValidationIssueDto {
  @ApiProperty({ example: 'email' })
  field: string;

  @ApiProperty({ example: 'Invalid email address' })
  message: string;

  @ApiProperty({ example: 'invalid_format' })
  code: string;
}

export class ErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({ example: 'VALIDATION_FAILED' })
  code: string;

  @ApiProperty({ example: 'Validation failed' })
  message: string;

  @ApiPropertyOptional({
    type: () => [ValidationIssueDto],
    description: 'Field-level validation issues, when applicable.',
  })
  errors?: ValidationIssueDto[];
}

export class RateLimitErrorResponseDto extends ErrorResponseDto {
  @ApiProperty({
    example: 60,
    description: 'Seconds to wait before retrying the request.',
  })
  retryAfterSeconds: number;
}
