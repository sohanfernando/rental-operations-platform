import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';

interface ErrorResponse {
  status(code: number): { json(body: { statusCode: number; message: string | string[] }): void };
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<ErrorResponse>();
    let statusCode = 500;
    let message: string | string[] = 'Internal server error.';

    if (error instanceof HttpException && error.getStatus() < 500) {
      statusCode = error.getStatus();
      const details = error.getResponse();
      message = typeof details === 'object' && 'message' in details
        ? details.message as string | string[]
        : error.message;
    } else {
      // ORM error messages can include query parameters. Log only the error category.
      this.logger.error({ statusCode, error: error instanceof Error ? error.name : 'UnknownError' });
    }

    response.status(statusCode).json({ statusCode, message });
  }
}
