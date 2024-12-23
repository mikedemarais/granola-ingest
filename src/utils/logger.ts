import { createLogger, format, transports } from 'winston';

const isDebug = process.env.DEBUG === 'true';

export const logger = createLogger({
  level: isDebug ? 'debug' : 'info',
  format: format.combine(
    format.timestamp(),
    format.json(),
    format.printf(({ timestamp, level, message, ...rest }) => {
      const context = rest.context ? `[${rest.context}] ` : '';
      return `${timestamp} ${level}: ${context}${message} ${JSON.stringify(rest)}`;
    })
  ),
  transports: [
    new transports.File({ filename: 'logs/error.log', level: 'error' }),
    new transports.File({ filename: 'logs/combined.log' }),
    new transports.Console({
      format: format.combine(format.colorize(), format.simple())
    })
  ]
});

export function debug(context: string, message: string, data?: any) {
  if (isDebug) {
    logger.debug(message, { context, ...data });
  }
}