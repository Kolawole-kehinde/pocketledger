import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../modules/authorization/decorators/public.decorator.js';
import { AppService } from './app.service.js';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get('health')
  @ApiOperation({
    summary: 'Service health',
    description:
      'Reports service liveness together with the database dependency state.',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        service: { type: 'string', example: 'PocketLedger API' },
        dependencies: {
          type: 'object',
          properties: {
            database: { type: 'string', example: 'connected' },
          },
        },
      },
    },
  })
  @ApiServiceUnavailableResponse({
    description: 'A dependency is unavailable.',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'error' },
        service: { type: 'string', example: 'PocketLedger API' },
        dependencies: {
          type: 'object',
          properties: {
            database: { type: 'string', example: 'disconnected' },
          },
        },
      },
    },
  })
  getHealth() {
    return this.appService.getHealth();
  }
}
