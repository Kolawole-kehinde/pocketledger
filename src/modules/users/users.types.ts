import { NodePgTransaction } from 'drizzle-orm/node-postgres';
import type { NewUser } from '../../infrastructure/database/schema/users.schema.js';
import { ExtractTablesWithRelations } from 'drizzle-orm';
import type * as schema from '../../infrastructure/database/database.types.js';

export type UserTransaction = NodePgTransaction<
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;



export type CreateUserData = {
  firstName: string;
  lastName: string;
  middleName?: string | null;
  username: string;
  email: string;
  phoneNumber: string;
};

export type CreateVerifiedCustomerData = Pick<
  NewUser,
  'firstName' | 'lastName' | 'middleName' | 'username' | 'email' | 'phoneNumber'
>;

export type UpdateUserData = Pick< NewUser,
  'firstName'
  |'lastName'
  |'middleName'
  |'username'
  |'phoneNumber'
>;

