import { Inject, Injectable } from '@nestjs/common';
import type { Database } from '../../infrastructure/database/database.types.js';
import {
  users,
  type NewUser,
  type User,
} from '../../infrastructure/database/schema/users.schema.js';
import { eq } from 'drizzle-orm';

@Injectable()
export class UsersRepository {
  constructor(@Inject('DATABASE') private readonly db: Database) {}

  async create(data: NewUser): Promise<User> {
    const [user] = await this.db
    .insert(users)
    .values(data)
    .returning();

    return user;
  }

  async findById(id: string): Promise<User | null>{
     const [user] = await this.db
     .select()
     .from(users)
     .where(eq(users.id, id))
     .limit(1)

     return  user ?? null
  };

  async findByEmail(email: string): Promise<User | null >{
      const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1)
    
      return user ?? null
  };
   async update(id: string, data: Partial<NewUser>): Promise<User | null>{
       const [user] = await this.db
       .update(users)
       .set({
        ...data,
        updatedAt: new Date()
       })
       .where(eq(users.id, id))
       .returning()

       return user ?? null
   }
}