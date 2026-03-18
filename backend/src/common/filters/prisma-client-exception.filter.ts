import { ArgumentsHost, Catch, HttpStatus } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaClientExceptionFilter extends BaseExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // P2002: Unique constraint failed
    if (exception.code === 'P2002') {
      const status = HttpStatus.CONFLICT;

      response.status(status).json({
        statusCode: status,
        message: 'Resource already exists or conflicts with an existing value',
      });
    } else if (exception.code === 'P2025') {
      // P2025: Record not found
      const status = HttpStatus.NOT_FOUND;
      response.status(status).json({
        statusCode: status,
        message: 'Record not found',
      });
    } else {
      // Default to parent implementation for other errors
      super.catch(exception, host);
    }
  }
}
