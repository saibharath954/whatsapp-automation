import pino from 'pino';
import { config } from '../config';

function createLogger() {
    const opts: pino.LoggerOptions = {
        level: config.nodeEnv === 'production' ? 'info' : (config.nodeEnv === 'test' ? 'silent' : 'debug'),
        serializers: pino.stdSerializers,
        base: { service: 'wa-automation' },
    };

    // Only use pino-pretty in development (not test/production)
    if (config.nodeEnv === 'development') {
        try {
            require.resolve('pino-pretty');
            opts.transport = { target: 'pino-pretty', options: { colorize: true } };
        } catch {
            // pino-pretty not installed, skip
        }
    }

    return pino(opts);
}

export const logger = createLogger();

export function createChildLogger(context: Record<string, unknown>) {
    return logger.child(context);
}
