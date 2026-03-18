import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export type RequestWithRequestId = Request & {
  requestId?: string;
  user?: {
    userId?: string;
  };
};

const SAFE_REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: RequestWithRequestId, res: Response, next: NextFunction) {
    const incomingRequestId = req.header('x-request-id');
    const requestId =
      typeof incomingRequestId === 'string' &&
      SAFE_REQUEST_ID_PATTERN.test(incomingRequestId.trim())
        ? incomingRequestId.trim()
        : randomUUID();

    req.requestId = requestId;
    res.setHeader('X-Request-ID', requestId);
    next();
  }
}
