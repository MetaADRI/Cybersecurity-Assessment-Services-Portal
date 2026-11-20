import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import type { Db } from './database/db';
import type { Env } from './config/env';
import { corsOrigins } from './config/env';
import { csrfGuard, originGuard, sessionMiddleware } from './middleware/auth';
import { clientCsrfGuard, clientSessionMiddleware } from './middleware/client-auth';
import { errorHandler, notFoundHandler } from './middleware/validation';
import { authRouter, usersRouter } from './routes/auth';
import { customersRouter } from './routes/customers';
import { assessmentsRouter } from './routes/assessments';
import { findingsRouter, importRouter } from './routes/findings';
import { dashboardRouter } from './routes/dashboard';
import { settingsRouter } from './routes/settings';
import { reportsRouter } from './routes/reports';
import { publicRouter } from './routes/public';
import { clientAuthRouter } from './routes/client-auth';
import { clientRouter } from './routes/client';
import { serviceRequestsRouter } from './routes/service-requests';
import { seedServiceCatalog } from './database/service-catalog';
import { logger } from './utils/logger';

export interface AppDeps {
  db: Db;
  env: Env;
}

export async function createApp(deps: AppDeps): Promise<express.Express> {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  await seedServiceCatalog(deps.db);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-origin' },
    }),
  );
  app.use(cors({ origin: corsOrigins(deps.env), credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(cookieParser());

  app.use((req, _res, next) => {
    req.db = deps.db;
    req.env = deps.env;
    req.clientIp = req.ip;
    next();
  });
  app.use(sessionMiddleware({ db: deps.db, env: deps.env }));
  app.use(clientSessionMiddleware({ db: deps.db, env: deps.env }));
  app.use(originGuard(corsOrigins(deps.env)));
  app.use(csrfGuard());
  app.use(clientCsrfGuard());

  const authLimiter = rateLimit({
    windowMs: deps.env.RATE_LIMIT_WINDOW_MS,
    max: deps.env.RATE_LIMIT_AUTH_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: { code: 'rate_limited', message: 'Too many attempts. Please try again shortly.' },
    },
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  const api = express.Router();
  api.use('/auth/login', authLimiter);
  api.use('/auth', authRouter());
  api.use('/users', usersRouter());
  api.use('/customers', customersRouter());
  api.use('/assessments', assessmentsRouter());
  api.use('/findings', findingsRouter());
  api.use('/import', importRouter());
  api.use('/dashboard', dashboardRouter());
  api.use('/settings', settingsRouter());
  api.use('/reports', reportsRouter());
  api.use('/public/client', clientAuthRouter());
  api.use('/public', publicRouter());
  api.use('/client', clientRouter());
  api.use('/service-requests', serviceRequestsRouter());
  app.use('/api/v1', api);

  // Static client build (production). In development the Vite dev server runs instead.
  const clientDir = path.resolve(process.cwd(), 'dist/client');
  if (fs.existsSync(clientDir)) {
    app.use(express.static(clientDir, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api\/).*/, (_req, res, next) => {
      res.sendFile(path.join(clientDir, 'index.html'), (err) => {
        if (err) next();
      });
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  app.locals.db = deps.db;
  app.locals.env = deps.env;
  logger.info('Express application created', {
    nodeEnv: deps.env.NODE_ENV,
    clientBuildPresent: fs.existsSync(clientDir),
  });

  return app;
}
