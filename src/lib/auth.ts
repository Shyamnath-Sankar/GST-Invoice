/** Password hashing, token generation and password rules. No framework imports. */
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

const MIN_LENGTH = 10;
const MAX_BCRYPT_BYTES = 72;

function rounds(): number {
  const configured = Number(process.env.BCRYPT_ROUNDS ?? "12");
  return Number.isInteger(configured) && configured >= 4 && configured <= 15 ? configured : 12;
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password.slice(0, MAX_BCRYPT_BYTES), rounds());
}

export function verifyPassword(password: string, hash: string): boolean {
  try {
    return bcrypt.compareSync(password.slice(0, MAX_BCRYPT_BYTES), hash);
  } catch {
    return false;
  }
}

/** Returns a human-readable problem, or null when the password is acceptable. */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_LENGTH) {
    return `Use at least ${MIN_LENGTH} characters`;
  }
  if (/^\d+$/.test(password) || /^[A-Za-z]+$/.test(password)) {
    return "Mix letters with numbers or symbols";
  }
  return null;
}

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export const PASSWORD_MIN_LENGTH = MIN_LENGTH;
