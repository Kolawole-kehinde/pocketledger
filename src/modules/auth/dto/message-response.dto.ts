import { ApiProperty } from '@nestjs/swagger';

export class MessageResponseDto {
  @ApiProperty({ example: 'You have been signed out' })
  message: string;

  constructor(message: string) {
    this.message = message;
  }
}
