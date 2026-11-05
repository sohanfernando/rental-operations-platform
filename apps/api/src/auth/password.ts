import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const keyLength = 64;
const options = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
export const dummyPasswordHash = `scrypt:${'0'.repeat(32)}:${'0'.repeat(keyLength * 2)}`;

function deriveKey(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt);
  return `scrypt:${salt.toString('hex')}:${key.toString('hex')}`;
}

export async function verifyPassword(password: string, hash: string) {
  const match = /^scrypt:([a-f0-9]{32}):([a-f0-9]{128})$/.exec(hash);
  if (!match) return false;

  const [, salt, expected] = match;
  const key = await deriveKey(password, Buffer.from(salt, 'hex'));
  return timingSafeEqual(key, Buffer.from(expected, 'hex'));
}
