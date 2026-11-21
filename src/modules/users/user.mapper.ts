import type { User } from '../../generated/prisma/client.js';
import { toNationalPhone } from '../../lib/phone.js';

/** The user as the apps see it (matches `User` in the dashboard types). */
export interface UserDto {
  id: string;
  role: User['role'];
  name: string;
  phone?: string;
  email?: string;
  status: User['status'];
  onboarded: boolean;
  companyId?: string;
  createdAt: string;
}

/** Picks only safe fields. Never send a database row (it has passwordHash) straight to the client. */
export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    role: user.role,
    name: user.name,
    phone: toNationalPhone(user.phone),
    email: user.email ?? undefined,
    status: user.status,
    onboarded: user.onboarded,
    companyId: user.companyId ?? undefined,
    createdAt: user.createdAt.toISOString(),
  };
}
