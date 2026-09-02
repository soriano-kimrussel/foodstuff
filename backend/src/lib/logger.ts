/* eslint-disable no-console */

/**
 * Structured-ish logging without pulling in pino for a test project. One line
 * per event, JSON in production so a log shipper can parse it, human-readable
 * in development.
 */
import { env } from '../config/env.js';

type Level = 'debug' | 'info' | 'warn' | 'error';

function emit(level: Level, message: string, context?: Record<string, unknown>): void {
  if (env.isTest && level !== 'error') return;

  if (env.isProduction) {
    console[level === 'debug' ? 'log' : level](
      JSON.stringify({ level, message, time: new Date().toISOString(), ...context }),
    );
    return;
  }

  const suffix = context && Object.keys(context).length ? ` ${JSON.stringify(context)}` : '';
  console[level === 'debug' ? 'log' : level](`[${level}] ${message}${suffix}`);
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => emit('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => emit('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => emit('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => emit('error', message, context),
};
