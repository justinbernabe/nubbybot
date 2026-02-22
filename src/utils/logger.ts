import winston from 'winston';
import { config } from '../config.js';
import { MemoryTransport } from '../admin/memoryTransport.js';

export const memoryTransport = new MemoryTransport({ level: 'debug' });

export const logger = winston.createLogger({
  level: config.bot.logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...rest }) => {
          const extra = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
          return `${timestamp} ${level}: ${message}${extra}`;
        }),
      ),
    }),
    memoryTransport,
  ],
});
