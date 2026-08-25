import winston from 'winston';
import { config } from '../config/env';

// Structured JSON in Azure so Log Analytics / App Insights can parse fields;
// human-readable single lines locally.
const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

const developmentFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, stack, ...rest } = info;
    const extra = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
    return `${timestamp} ${level}: ${stack || message}${extra}`;
  }),
);

export const logger = winston.createLogger({
  level: config.isProduction ? 'info' : 'debug',
  format: config.isProduction ? productionFormat : developmentFormat,
  defaultMeta: { service: 'documind-api' },
  transports: [
    // stdout/stderr only. App Service captures the streams; writing to the
    // container filesystem would be lost on restart and fill the disk.
    new winston.transports.Console({ handleExceptions: true }),
  ],
  exitOnError: false,
});
