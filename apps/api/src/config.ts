import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  WEB_ORIGIN: z.url().refine((value) => {
    const url = URL.parse(value);
    return url?.origin === value && ['http:', 'https:'].includes(url.protocol);
  }).default('http://localhost:5173'),
  SESSION_HOURS: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(168))
    .default(12),
  HOLD_SECONDS: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(3600))
    .default(900),
  RECONCILE_SECONDS: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(600))
    .default(30),
  JOB_QUEUE_PREFIX: z.string().regex(/^[A-Za-z0-9_-]{1,48}$/).default('rental'),
  API_PORT: z
    .string()
    .regex(/^\d+$/, 'Use a decimal port number')
    .transform(Number)
    .pipe(z.number().int().min(1).max(65535))
    .default(3000),
  DATABASE_URL: z
    .url({ protocol: /^mysql$/, hostname: /.+/ })
    .refine((value) => {
      const url = URL.parse(value);
      return Boolean(url?.username && url.pathname.length > 1);
    }, 'Include a MySQL user and database name'),
  REDIS_URL: z.url({ protocol: /^rediss?$/, hostname: /.+/ }),
}).refine(
  (environment) => environment.NODE_ENV !== 'production' || environment.WEB_ORIGIN.startsWith('https://'),
  { path: ['WEB_ORIGIN'] },
);

export const APP_ENV = Symbol('APP_ENV');
export type AppEnvironment = z.output<typeof environmentSchema>;

export function parseEnvironment(environment: NodeJS.ProcessEnv) {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    // Report the invalid keys without echoing connection URLs or credentials.
    const keys = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(`Invalid configuration: ${keys.join(', ')}. See .env.example.`);
  }

  return result.data;
}

export function loadEnvironment() {
  const envFile = resolve(__dirname, '../../../.env');
  if (existsSync(envFile)) {
    loadEnvFile(envFile);
  }

  return parseEnvironment(process.env);
}
