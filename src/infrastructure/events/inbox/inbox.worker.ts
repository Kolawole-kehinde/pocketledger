import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InboxRepository } from './inbox.repository.js';
import type { InboxEventHandler } from './inbox-event-handler.interface.js';
import { INBOX_EVENT_HANDLER } from './inbox-event-handler.token.js';
import type { Database } from '../../../database/database.types.js';
import { INBOX_WORKER_CONFIG } from './inbox-worker-config.token.js';
import type { InboxWorkerConfig } from './inbox.types.js';


@Injectable()
export class InboxWorker implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly inboxRepository: InboxRepository,
    @Inject(INBOX_EVENT_HANDLER)
    private readonly inboxHandler: InboxEventHandler,
    @Inject('DATABASE')
    private readonly db: Database,
    @Inject(INBOX_WORKER_CONFIG)
    private readonly config: InboxWorkerConfig,
   
  ) {}
}