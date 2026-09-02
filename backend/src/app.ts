import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { healthRouter } from './routes/health.routes.js';
import { meRouter } from './routes/me.routes.js';
import { productsRouter } from './routes/products.routes.js';
import { searchesRouter } from './routes/searches.routes.js';
import { billingRouter } from './routes/billing.routes.js';
import { webhooksRouter } from './routes/webhooks.routes.js';

/**
 * Assembling the app is kept separate from listening on a port so the test
 * suite can drive it through supertest without binding a socket.
 */
export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());

  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true,
    }),
  );

  if (!env.isTest) {
    app.use(morgan(env.isProduction ? 'combined' : 'dev'));
  }

  // ORDER MATTERS. Stripe signs the raw request bytes, so the webhook route
  // must receive a Buffer. Mounting express.raw() for that exact path before
  // express.json() is what keeps the body unparsed there and parsed everywhere
  // else. Swapping these two lines silently breaks signature verification.
  app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));
  app.use(express.json({ limit: '1mb' }));

  app.use('/api', healthRouter);
  app.use('/api', meRouter);
  app.use('/api', productsRouter);
  app.use('/api', searchesRouter);
  app.use('/api', billingRouter);
  app.use('/api', webhooksRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
