import pino from 'pino';
import pretty from 'pino-pretty';

import { colorLoggerName, colorLogLevel } from './colors.ts';

export interface LoggerOptions {
	/** Name included in every log entry. */
	name?: string;
	/** Minimum level emitted by the logger. */
	level?: pino.LevelWithSilent;
	/** Additional object paths that must be redacted. */
	redact?: string[];
}

export interface LoggerEnvironment {
	LOG_LEVEL?: string;
	NODE_ENV?: string;
	BUN_ENV?: string;
}

const { isoTime } = pino.stdTimeFunctions;

const DEFAULT_LOGGER_NAME = 'OBSERVATORY';
const SENSITIVE_FIELD_NAMES = ['password', 'token', 'apiKey', 'secret'] as const;
const DEFAULT_REDACT_PATHS = [
	...SENSITIVE_FIELD_NAMES,
	...SENSITIVE_FIELD_NAMES.map((fieldName) => `*.${fieldName}`),
	'DATABASE_URL',
];
const VALID_LEVELS = new Set(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']);

function resolveLogLevel(
	options: LoggerOptions,
	environment: LoggerEnvironment,
): pino.LevelWithSilent {
	const requestedLevel = (options.level ?? environment.LOG_LEVEL ?? 'info').toLowerCase();
	const isValidLevel = VALID_LEVELS.has(requestedLevel);

	if (!isValidLevel) {
		return 'info';
	}

	return requestedLevel as pino.LevelWithSilent;
}

function resolveRedactPaths(options: LoggerOptions): string[] {
	const requestedPaths = options.redact ?? [];
	return Array.from(new Set([...DEFAULT_REDACT_PATHS, ...requestedPaths]));
}

function isProductionEnvironment(environment: LoggerEnvironment): boolean {
	return (environment.BUN_ENV ?? environment.NODE_ENV) === 'production';
}

/**
 * Creates an Observatory logger.
 *
 * Production logs are structured JSON. Local logs use a compact human-readable format. Sensitive
 * fields are redacted in both formats.
 */
export function createLogger(
	options: LoggerOptions = {},
	environment: LoggerEnvironment = process.env,
): pino.Logger {
	const loggerName = options.name ?? DEFAULT_LOGGER_NAME;
	const logLevel = resolveLogLevel(options, environment);
	const redactPaths = resolveRedactPaths(options);

	const baseConfig: pino.LoggerOptions = {
		level: logLevel,
		name: loggerName,
		timestamp: isoTime,
		formatters: {
			level: (label) => ({ level: label }),
		},
		redact: {
			paths: redactPaths,
			censor: '[REDACTED]',
		},
	};

	if (isProductionEnvironment(environment)) {
		return pino(baseConfig);
	}

	const prettyStream = pretty({
		colorize: false,
		translateTime: 'HH:MM:ss',
		ignore: 'pid,hostname,name,level',
		sync: true,
		messageFormat: (log, messageKey) => {
			const name = (log as { name?: string }).name ?? DEFAULT_LOGGER_NAME;
			const level = (log as { level?: string }).level ?? 'info';
			const message = log[messageKey] as string;

			return `${colorLoggerName(name)} ${colorLogLevel(level)}: ${message}`;
		},
	});

	return pino(baseConfig, prettyStream);
}

export type Logger = pino.Logger;
