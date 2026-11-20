import bcrypt from 'bcryptjs';

/**
 * Password hashing with bcrypt (adaptive cost factor). The hash algorithm and
 * cost are stored inside the hash string, so future cost increases do not
 * invalidate existing passwords.
 */
const COST = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}
