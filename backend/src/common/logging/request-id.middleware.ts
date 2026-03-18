import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export type RequestWithRequestId = Request & {
  requestId?: string;
  user?: {
    userId?: string;
  };
};

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: RequestWithRequestId, res: Response, next: NextFunction) {
    const incomingRequestId = req.header('x-request-id');
    const requestId =
      typeof incomingRequestId === 'string' &&
      incomingRequestId.trim().length > 0
        ? incomingRequestId.trim()
        : randomUUID();

    req.requestId = requestId;
    res.setHeader('X-Request-ID', requestId);
    next();
  }
}
