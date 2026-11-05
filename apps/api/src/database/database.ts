import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client';

export function createDatabase(connectionString: string) {
  const url = new URL(connectionString);
  const adapter = new PrismaMariaDb({
    host: url.hostname.replace(/^\[|\]$/g, ''),
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    timezone: 'Z',
    connectionLimit: 10,
  });
  return new PrismaClient({ adapter });
}
