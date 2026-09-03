const { z } = require('zod');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.string().default('3306'),
  DB_USER: z.string().default('root'),
  DB_PASS: z.string().default(''),
  DB_NAME: z.string().default('attendance_app'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET too short'),
  JWT_REFRESH_SECRET: z.string().optional(),
  ACCESS_TOKEN_EXPIRES: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES: z.string().default('7d'),
  BCRYPT_ROUNDS: z.string().default('12'),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().default('attendance-app'),
  R2_PUBLIC_URL: z.string().optional(),
  // Global SMTP fallback (overridden by per-company AppSetting.smtp* if set)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_SECURE: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  SMTP_FROM_NAME: z.string().optional(),
});

function validateEnv() {
  try {
    return envSchema.parse(process.env);
  } catch (e) {
    // Don't crash on validation in dev - just warn
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[env] validation warnings:', e.errors?.map((x) => `${x.path}: ${x.message}`).join(', '));
      return process.env;
    }
    throw e;
  }
}

module.exports = { validateEnv, envSchema };
