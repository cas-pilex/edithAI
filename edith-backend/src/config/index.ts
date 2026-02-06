import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  API_URL: z.string().url().default('http://localhost:3000'),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Authentication
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
  BCRYPT_ROUNDS: z.string().transform(Number).default('12'),

  // Encryption
  ENCRYPTION_KEY: z.string().length(64),
  ENCRYPTION_KEY_TOKENS: z.string().length(64),
  ENCRYPTION_KEY_PII: z.string().length(64),

  // AI
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default('claude-sonnet-4-20250514'),
  AI_MAX_TOKENS: z.string().transform(Number).default('4096'),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),

  // Slack
  SLACK_CLIENT_ID: z.string().optional(),
  SLACK_CLIENT_SECRET: z.string().optional(),
  SLACK_SIGNING_SECRET: z.string().optional(),
  SLACK_REDIRECT_URI: z.string().optional(),

  // Telegram
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_BOT_USERNAME: z.string().optional(),
  TELEGRAM_WEBHOOK_URL: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),

  // WhatsApp (Twilio)
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_WHATSAPP_NUMBER: z.string().optional(),
  TWILIO_MESSAGING_SERVICE_SID: z.string().optional(),

  // Travel APIs
  AMADEUS_CLIENT_ID: z.string().optional(),
  AMADEUS_CLIENT_SECRET: z.string().optional(),
  AMADEUS_ENV: z.enum(['test', 'production']).default('test'),

  // Google Places
  GOOGLE_PLACES_API_KEY: z.string().optional(),

  // Uber
  UBER_CLIENT_ID: z.string().optional(),
  UBER_CLIENT_SECRET: z.string().optional(),
  UBER_SERVER_TOKEN: z.string().optional(),

  // Lyft
  LYFT_CLIENT_ID: z.string().optional(),
  LYFT_CLIENT_SECRET: z.string().optional(),

  // Monitoring
  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default('900000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default('100'),
});

function validateEnv() {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missing = error.errors.map((e) => e.path.join('.')).join(', ');
      throw new Error(`Missing or invalid environment variables: ${missing}`);
    }
    throw error;
  }
}

const env = validateEnv();

export const config = {
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  isDevelopment: env.NODE_ENV === 'development',
  isTest: env.NODE_ENV === 'test',

  server: {
    port: env.PORT,
    apiUrl: env.API_URL,
    frontendUrl: env.FRONTEND_URL,
    allowedOrigins: env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()),
  },

  database: {
    url: env.DATABASE_URL,
  },

  redis: {
    url: env.REDIS_URL,
  },

  auth: {
    jwtSecret: env.JWT_SECRET,
    jwtRefreshSecret: env.JWT_REFRESH_SECRET,
    accessTokenExpiry: env.JWT_ACCESS_EXPIRY,
    refreshTokenExpiry: env.JWT_REFRESH_EXPIRY,
    bcryptRounds: env.BCRYPT_ROUNDS,
    maxLoginAttempts: 5,
    lockoutDuration: 15 * 60 * 1000, // 15 minutes
  },

  encryption: {
    key: env.ENCRYPTION_KEY,
    tokenKey: env.ENCRYPTION_KEY_TOKENS,
    piiKey: env.ENCRYPTION_KEY_PII,
  },

  ai: {
    apiKey: env.ANTHROPIC_API_KEY,
    model: env.AI_MODEL,
    maxTokens: env.AI_MAX_TOKENS,
  },

  google: {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.GOOGLE_REDIRECT_URI,
    placesApiKey: env.GOOGLE_PLACES_API_KEY,
  },

  slack: {
    clientId: env.SLACK_CLIENT_ID,
    clientSecret: env.SLACK_CLIENT_SECRET,
    signingSecret: env.SLACK_SIGNING_SECRET,
    redirectUri: env.SLACK_REDIRECT_URI,
  },

  telegram: {
    botToken: env.TELEGRAM_BOT_TOKEN,
    botUsername: env.TELEGRAM_BOT_USERNAME,
    webhookUrl: env.TELEGRAM_WEBHOOK_URL,
    webhookSecret: env.TELEGRAM_WEBHOOK_SECRET,
  },

  twilio: {
    accountSid: env.TWILIO_ACCOUNT_SID,
    authToken: env.TWILIO_AUTH_TOKEN,
    whatsappNumber: env.TWILIO_WHATSAPP_NUMBER,
    messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID,
  },

  whatsapp: {
    accountSid: env.TWILIO_ACCOUNT_SID,
    authToken: env.TWILIO_AUTH_TOKEN,
    fromNumber: env.TWILIO_WHATSAPP_NUMBER,
    messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID,
    templates: {
      dailyBriefing: process.env.WA_TEMPLATE_DAILY_BRIEFING || 'HX_DAILY_BRIEFING',
      meetingReminder: process.env.WA_TEMPLATE_MEETING_REMINDER || 'HX_MEETING_REMINDER',
      emailAlert: process.env.WA_TEMPLATE_EMAIL_ALERT || 'HX_EMAIL_ALERT',
      approvalRequest: process.env.WA_TEMPLATE_APPROVAL_REQUEST || 'HX_APPROVAL_REQUEST',
      taskReminder: process.env.WA_TEMPLATE_TASK_REMINDER || 'HX_TASK_REMINDER',
      flightUpdate: process.env.WA_TEMPLATE_FLIGHT_UPDATE || 'HX_FLIGHT_UPDATE',
      welcome: process.env.WA_TEMPLATE_WELCOME || 'HX_WELCOME',
      verificationCode: process.env.WA_TEMPLATE_VERIFICATION || 'HX_VERIFICATION',
    },
  },

  amadeus: {
    clientId: env.AMADEUS_CLIENT_ID,
    clientSecret: env.AMADEUS_CLIENT_SECRET,
    env: env.AMADEUS_ENV,
  },

  uber: {
    clientId: env.UBER_CLIENT_ID,
    clientSecret: env.UBER_CLIENT_SECRET,
    serverToken: env.UBER_SERVER_TOKEN,
  },

  lyft: {
    clientId: env.LYFT_CLIENT_ID,
    clientSecret: env.LYFT_CLIENT_SECRET,
  },

  monitoring: {
    sentryDsn: env.SENTRY_DSN,
    logLevel: env.LOG_LEVEL,
  },

  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
  },
} as const;

export type Config = typeof config;
