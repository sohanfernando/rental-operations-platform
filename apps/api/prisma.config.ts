import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { defineConfig } from 'prisma/config';

const envFile = resolve(__dirname, '../../.env');
if (existsSync(envFile)) loadEnvFile(envFile);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'node dist/database/seed.js' },
  datasource: { url: process.env.DATABASE_URL },
});
