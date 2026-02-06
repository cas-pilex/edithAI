# Edith.ai Backend

AI-powered personal operations platform for entrepreneurs.

## Tech Stack

- **Runtime**: Node.js 20 with TypeScript (strict mode)
- **Framework**: Express.js with helmet, cors, compression
- **Database**: PostgreSQL 16 with Prisma ORM
- **Cache/Queue**: Redis 7 with BullMQ
- **Authentication**: JWT with refresh tokens, bcrypt
- **AI**: Anthropic Claude API
- **Real-time**: Socket.io
- **Validation**: Zod
- **Logging**: Winston (JSON format)
- **Testing**: Vitest
- **Package Manager**: pnpm

## Quick Start

### Prerequisites

- Node.js 20+
- Docker and Docker Compose
- pnpm (`npm install -g pnpm`)

### Setup

1. **Clone and install dependencies**
   ```bash
   git clone <repository>
   cd edith-backend
   pnpm install
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start databases**
   ```bash
   docker compose up -d
   ```

4. **Initialize database**
   ```bash
   pnpm db:generate
   pnpm db:push
   pnpm db:seed
   ```

5. **Start development server**
   ```bash
   pnpm dev
   ```

The API will be available at `http://localhost:3000`

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server with hot reload |
| `pnpm build` | Build for production |
| `pnpm start` | Run production build |
| `pnpm test` | Run tests |
| `pnpm db:generate` | Generate Prisma client |
| `pnpm db:push` | Push schema to database |
| `pnpm db:migrate` | Run database migrations |
| `pnpm db:seed` | Seed database with test data |
| `pnpm db:studio` | Open Prisma Studio |

## API Endpoints

### Health & Info
- `GET /health` - Full health check
- `GET /health/live` - Liveness probe
- `GET /health/ready` - Readiness probe
- `GET /info` - API information

### Authentication
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `POST /api/auth/refresh` - Refresh token
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password
- `GET /api/auth/me` - Get current user

### User
- `GET /api/user/profile` - Get profile
- `PATCH /api/user/profile` - Update profile
- `GET /api/user/preferences` - Get preferences
- `PATCH /api/user/preferences` - Update preferences
- `GET /api/user/export` - Export all data (GDPR)
- `DELETE /api/user/account` - Delete account (GDPR)

## Test Credentials

```
Email: test@edith.ai
Password: TestPassword123!
```

## Project Structure

```
src/
├── api/
│   ├── controllers/     # Request handlers
│   ├── middleware/      # Auth, rate limiting, validation
│   ├── routes/          # API route definitions
│   └── websocket/       # Socket.io handlers
├── agents/              # AI agents (Orchestrator, Inbox, Calendar, etc.)
├── config/              # Configuration and env validation
├── database/            # Prisma client and Redis
├── integrations/        # External API integrations
├── jobs/                # Background job processors
├── services/            # Business logic
├── types/               # TypeScript type definitions
├── utils/               # Helpers, logger, encryption
└── app.ts               # Application entry point
```

## Security Features

- **Encryption**: AES-256-GCM for OAuth tokens and PII
- **Authentication**: JWT with refresh token rotation
- **Rate Limiting**: Per-user and per-IP
- **Brute Force Protection**: Account lockout after failed attempts
- **Audit Logging**: All data access and security events
- **GDPR Compliance**: Data export and deletion

## Docker

### Development
```bash
docker compose up -d
```

### Production
```bash
docker compose -f docker-compose.prod.yml up -d
```

## Environment Variables

See `.env.example` for all available configuration options.

### Required Variables
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - JWT signing secret (min 32 chars)
- `JWT_REFRESH_SECRET` - Refresh token secret (min 32 chars)
- `ENCRYPTION_KEY` - Main encryption key (64 hex chars)
- `ENCRYPTION_KEY_TOKENS` - OAuth token encryption key
- `ENCRYPTION_KEY_PII` - PII data encryption key

### Optional Variables
- `ANTHROPIC_API_KEY` - For AI features
- `GOOGLE_CLIENT_ID/SECRET` - For Gmail/Calendar integration
- `SLACK_CLIENT_ID/SECRET` - For Slack integration
- And more...

## License

Proprietary - All rights reserved
