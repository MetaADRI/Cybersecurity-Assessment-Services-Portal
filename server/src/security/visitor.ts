import { createHash, randomBytes } from 'node:crypto';

export function hashVisitorValue(value: string, secret: string): string {
  return createHash('sha256').update(`${secret}:${value}`).digest('hex');
}

export function hashIp(ip: string, secret: string): string {
  return hashVisitorValue(`ip:${ip}`, secret);
}

export function hashFingerprint(fingerprint: string, secret: string): string {
  return hashVisitorValue(`fp:${fingerprint}`, secret);
}

export function newOpaqueToken(): string {
  return randomBytes(32).toString('hex');
}

export function newVisitorCookieId(): string {
  return randomBytes(24).toString('hex');
}

export function newVerificationCode(): string {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
}

export function hashVerificationCode(clientId: string, code: string, secret: string): string {
  return createHash('sha256').update(`${secret}:verify:${clientId}:${code}`).digest('hex');
}
