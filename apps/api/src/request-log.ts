import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { type ServerResponse } from 'node:http';
import { type SessionRequest } from './auth/session';

const logger = new Logger('HttpRequests');

export function requestLog(request: SessionRequest, response: ServerResponse, next: () => void) {
  const requestId = randomUUID();
  const started = performance.now();
  request.requestId = requestId;
  response.setHeader('X-Request-Id', requestId);
  response.once('finish', () => {
    logger.log({
      event: 'http_request', requestId, method: request.method, statusCode: response.statusCode,
      durationMs: Math.round(performance.now() - started),
    });
  });
  next();
}
