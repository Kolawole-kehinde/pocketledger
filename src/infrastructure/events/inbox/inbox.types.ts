
import type { NodePgTransaction } from 'drizzle-orm/node-postgres';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type * as schema from '../../../database/schema/index.js';
import type { InboxEvent } from '../../../database/schema/inbox-events.schema.js';


export type InboxTransaction = NodePgTransaction<
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export type EventStatus =
  | 'received'
  | 'processing'
  | 'processed'
  | 'failed'
  | 'dead_lettered';

// Incoming event received from Kafka
export interface InboxInput {
  eventId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  schemaVersion: number;
  payload: Record<string, unknown>;
  correlationId: string | null;
  occurredAt: string;
}

// Input for recording an incoming event
export interface RecordInboxEventInput extends InboxInput {
  consumerName: string;
}

// Result of recording an event
export interface EventCreateResult {
  type: 'created';
  eventId: string;
}

export interface EventAlreadyExistsResult {
  type: 'already_exists';
  eventId: string;
  existingStatus: EventStatus;
}

export type RecordEventResult =
  | EventCreateResult
  | EventAlreadyExistsResult;

// Event returned after a successful claim
export interface ClaimedInboxEvent {
  id: string;
  eventId: string;
  consumerName: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  schemaVersion: number;
  payload: Record<string, unknown>;
  correlationId: string | null;
  occurredAt: Date;
  claimToken: string;
  lockedBy: string;
  leaseExpiresAt: Date;
  attempts: number;
  maxAttempts: number;
}

export interface ClaimInboxEventInput {
  workerId: string;
  consumerName: string;
  leaseDuration: number;
   batchSize: number;
}

export interface GetEventsByStatusResult {
  events: InboxEvent[];
  total: number;
}

export interface InboxLeaseClaim {
  eventId: string;
  claimToken: string;
  lockedBy: string;
}

export interface RenewInboxLeasesInput {
  consumerName: string;
  claims: InboxLeaseClaim[];
}
export type RenewInboxLeasesResult = string[];



