import { createHash, createHmac, randomBytes } from 'node:crypto';

export function linkToken(secret: string, material: string): string {
  return createHmac('sha256', secret).update(material).digest().subarray(0, 16).toString('base64url');
}

export function tokenHash(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

export function randomToken(): string {
  return randomBytes(16).toString('base64url');
}

export function hashPrefix(hash: Buffer): string {
  return hash.toString('hex').slice(0, 8);
}

export function recipientMaterial(recipientId: string, version: number): string {
  return `${recipientId}:${version}`;
}

export function sharedMaterial(invitationId: string, version: number): string {
  return `${invitationId}:shared:${version}`;
}

export function ipHash(ip: string): string {
  return createHash('sha256').update(ip).digest('hex');
}
