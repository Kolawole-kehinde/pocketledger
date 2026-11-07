
import {
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
  integer,
  index,
  uniqueIndex,
  jsonb,
} from 'drizzle-orm/pg-core';

export const inboxEventStatusEnum = pgEnum('inbox_event_status', [
  'received',
  'processing',
  'processed',
  'failed',
  'dead_lettered',
]);

export const inboxEvents = pgTable(
  'inbox_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    consumerName: varchar('consumer_name', {
      length: 200,
    }).notNull(),

    eventId: uuid('event_id').notNull(),

    eventType: varchar('event_type', { length: 200 }).notNull(),

    schemaVersion: integer('schema_version').notNull().default(1),

    aggregateType: varchar('aggregate_type', { length: 100 }).notNull(),

    aggregateId: varchar('aggregate_id', { length: 255 }).notNull(),

    payload: jsonb('payload')
      .$type<Record<string, unknown>>()
      .notNull(),

    correlationId: uuid('correlation_id'),

    occurredAt: timestamp('occurred_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),

    status: inboxEventStatusEnum('status')
      .notNull()
      .default('received'),

    attempts: integer('attempts').notNull().default(0),

    maxAttempts: integer('max_attempts').notNull().default(10),

    availableAt: timestamp('available_at', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow(),

    processingAt: timestamp('processing_at', {
      withTimezone: true,
      mode: 'date',
    }),

    claimToken: uuid('claim_token'),

    lockedBy: varchar('locked_by', { length: 255 }),

    leaseExpiresAt: timestamp('lease_expires_at', {
      withTimezone: true,
      mode: 'date',
    }),

    receivedAt: timestamp('received_at', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow(),

    processedAt: timestamp('processed_at', {
      withTimezone: true,
      mode: 'date',
    }),

    failureReason: varchar('failure_reason', { length: 1000 }),

    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('inbox_events_consumer_event_unique').on(
      table.consumerName,
      table.eventId,
    ),

    index('inbox_events_event_type_idx').on(table.eventType),

    index('inbox_events_status_available_at_idx').on(
      table.status,
      table.availableAt,
    ),

    index('inbox_events_status_lease_expires_at_idx').on(
      table.status,
      table.leaseExpiresAt,
    ),

    index('inbox_events_created_at_idx').on(table.createdAt),
  ],
);

export type InboxEvent = typeof inboxEvents.$inferSelect;
export type NewInboxEvent = typeof inboxEvents.$inferInsert;
