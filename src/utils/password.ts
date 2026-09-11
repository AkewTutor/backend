import bcrypt from 'bcrypt';
import { env } from '../config/env.js';

export async function hashPassword(password: string): Promise<string> {
  const saltRounds = parseInt(env.BCRYPT_SALT_ROUNDS, 10);
  return bcrypt.hash(password, saltRounds);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
