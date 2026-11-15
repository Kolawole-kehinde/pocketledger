
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  pgTable,
  smallint,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const currencies = pgTable(
  'currencies',
  {
    id: uuid('id').primaryKey(),

    code: varchar('code', { length: 3 }).notNull(),

    name: varchar('name', { length: 100 }).notNull(),

    minorUnit: smallint('minor_unit').notNull(),

    isActive: boolean('is_active').notNull().default(true),

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
    unique('currencies_code_unique').on(table.code),

    check(
      'currencies_code_format_check',
      sql`${table.code} ~ '^[A-Z]{3}$'`,
    ),

    check(
      'currencies_minor_unit_check',
      sql`${table.minorUnit} BETWEEN 0 AND 4`,
    ),
  ],
);

export type Currency = typeof currencies.$inferSelect;
export type NewCurrency = typeof currencies.$inferInsert;
