import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { User } from '../../infrastructure/database/schema/users.schema.js';
import { UsersRepository } from './users.repository.js';
import type { CreateVerifiedCustomerData, UpdateUserData } from './users.types.js';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async createVerifiedCustomer(
    data: CreateVerifiedCustomerData,
  ): Promise<User> {
    const normalizedEmail = data.email.trim().toLowerCase();

    const existingUser =  await this.usersRepository.findByEmail(normalizedEmail);

    if (existingUser) {
      throw new ConflictException('An account with this email already exists');
    }

    const user = await this.usersRepository.create({
      ...data,
      email: normalizedEmail,
      role: 'customer',
      status: 'active',
    });

    return user;
  }

   async findByEmail(email: string): Promise<User | null>{
     return this.usersRepository.findByEmail(email)
   }


   async findById(id: string): Promise<User | null>{
      return this.usersRepository.findById(id)
   }

 async update(id: string, data: UpdateUserData): Promise<User> {
  if (Object.keys(data).length === 0) {
    throw new BadRequestException(
      'At least one field must be provided for update',
    );
  }

  const updatedUser = await this.usersRepository.update(id, data);

  if (!updatedUser) {
    throw new NotFoundException('User not found');
  }

  return updatedUser;
}
}
