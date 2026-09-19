import { ExceptionFilter, Catch, HttpException, ArgumentsHost } from "@nestjs/common";
import type { Request, Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
    catch(exception: HttpException, host: ArgumentsHost) {
        const ctx = host.switchToHttp()
        const request = ctx.getRequest<Request>()
        const response = ctx.getResponse<Response>()
        const status = exception.getStatus()
        const exceptionResponse = exception.getResponse()

        const message = typeof exceptionResponse === 'string' 
         ? exceptionResponse
         : (exceptionResponse as { message?: string | string[] }).message ?? exception.message

        response.status(status).json({
            statusCode: status,
            message,
            timestamp: new Date().toISOString(),
            path: request.path
        })
    }
}