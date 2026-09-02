/**
 * Errors that are safe to show a client. Anything thrown that is *not* an
 * HttpError is treated as a bug by the error handler and reported as a bare
 * 500, so internal messages never leak into a response body.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown): HttpError {
    return new HttpError(400, 'bad_request', message, details);
  }

  static notFound(message: string): HttpError {
    return new HttpError(404, 'not_found', message);
  }

  static paymentRequired(message: string): HttpError {
    return new HttpError(402, 'subscription_required', message);
  }

  static badGateway(message: string): HttpError {
    return new HttpError(502, 'upstream_error', message);
  }

  static serviceUnavailable(message: string): HttpError {
    return new HttpError(503, 'service_unavailable', message);
  }
}
