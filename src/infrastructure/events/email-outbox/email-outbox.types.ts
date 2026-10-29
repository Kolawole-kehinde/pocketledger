
import type { NodePgTransaction } from 'drizzle-orm/node-postgres';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type * as schema from '../../../database/schema/index.js';
import { EmailOutboxJob } from '../../../database/schema/email-outbox.schema.js';


export type EmailOutboxTransaction = NodePgTransaction<
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export type ClaimedEmailOutboxJob = Pick<
  EmailOutboxJob,
  | 'id'
  | 'recipient'
  | 'template'
  | 'encryptedPayload'
  | 'encryptionKeyVersion'
  | 'attemptCount'
  | 'maxAttempts'
>;
