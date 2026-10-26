
import {
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
  jsonb,
  integer,
  index,
  bigint
} from 'drizzle-orm/pg-core';

export const outboxEventStatusEnum = pgEnum('outbox_event_status', [
  'pending',
  'processing',
  'published',
  'dead_lettered',
]);

export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventType: varchar('event_type', { length: 200 }).notNull(),
    schemaVersion: integer('schema_version').notNull().default(1),
    aggregateType: varchar('aggregate_type', { length: 100 }).notNull(),
    aggregateId: varchar('aggregate_id', { length: 255 }).notNull(),
    aggregateSequence: bigint('aggregate_sequence', {
      mode: 'number',
    }),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    correlationId: uuid('correlation_id'),
    status: outboxEventStatusEnum('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(10),
    availableAt: timestamp('available_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    processingAt: timestamp('processing_at', {
      withTimezone: true,
    }),
    claimToken: uuid('claim_token'),
    lockedBy: varchar('locked_by', { length: 255 }),
    leaseExpiresAt: timestamp('lease_expires_at', {
      withTimezone: true,
    }),
    occurredAt: timestamp('occurred_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    publishedAt: timestamp('published_at', {
      withTimezone: true,
    }),
    lastError: varchar('last_error', { length: 1000 }),
    createdAt: timestamp('created_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('outbox_events_status_available_at_idx').on(
      table.status,
      table.availableAt,
    ),
    index('outbox_events_aggregate_idx').on(
      table.aggregateType,
      table.aggregateId,
    ),
    index('outbox_events_event_type_idx').on(table.eventType),
    index('outbox_events_created_at_idx').on(table.createdAt),
    index('outbox_events_lease_expires_at_idx').on(
      table.status,
      table.leaseExpiresAt,
    ),
    index('outbox_events_aggregate_sequence_idx').on(
  table.aggregateType,
  table.aggregateId,
  table.aggregateSequence,
),
  ],
);

export type OutboxEvent = typeof outboxEvents.$inferSelect;
export type NewOutboxEvent = typeof outboxEvents.$inferInsert;
