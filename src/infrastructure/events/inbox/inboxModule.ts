import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../../database/database.module.js";
import { InboxRepository } from "./inbox.repository.js";
import { INBOX_WORKER_CONFIG } from "./inbox-worker-config.token.js";


@Module({
    imports: [DatabaseModule],
    providers: [
        InboxRepository,
         {
            provide: INBOX_WORKER_CONFIG,
            useValue:{
              consumerName: 'pocketledger',
              batchSize: 20,
              leastDuration: 60_000,
              concurrency: 5,
              pollingInterval: 1_000,
              maxPollingInterval: 10_000
            }
         }
    ],
    
})

export class InboxRepositoryModule {}