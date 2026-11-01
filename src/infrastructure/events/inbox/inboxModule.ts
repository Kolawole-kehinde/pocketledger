import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../../database/database.module.js";
import { InboxRepository } from "./inbox.repository.js";


@Module({
    imports: [DatabaseModule],
    providers: [InboxRepository]
})

export class InboxRepositoryModule {}