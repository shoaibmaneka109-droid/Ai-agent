const { createLogger, format, transports } = require('winston');
const { combine, timestamp, errors, json, colorize, simple } = format;

const isDevelopment = process.env.NODE_ENV !== 'production';

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    json()
  ),
  defaultMeta: { service: 'securepay-api' },
  transports: [
    new transports.Console({
      format: isDevelopment
        ? combine(colorize(), simple())
        : combine(timestamp(), json()),
    }),
  ],
});

module.exports = logger;
