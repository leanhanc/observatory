import { describe, expect, test } from 'bun:test';

import { createLogger } from './logger.ts';

describe('createLogger', () => {
	test('uses Observatory defaults', () => {
		const logger = createLogger({}, { NODE_ENV: 'production' });

		expect(logger.level).toBe('info');
		expect(logger.bindings().name).toBe('OBSERVATORY');
	});

	test('uses the environment level when no option is provided', () => {
		const logger = createLogger({}, { LOG_LEVEL: 'warn', NODE_ENV: 'production' });

		expect(logger.level).toBe('warn');
	});

	test('prefers the explicit level over the environment', () => {
		const logger = createLogger(
			{ level: 'debug' },
			{ LOG_LEVEL: 'warn', NODE_ENV: 'production' },
		);

		expect(logger.level).toBe('debug');
	});

	test('falls back to info for an invalid environment level', () => {
		const logger = createLogger({}, { LOG_LEVEL: 'verbose', NODE_ENV: 'production' });

		expect(logger.level).toBe('info');
	});

	test('redacts top-level and nested secret fields', () => {
		const loggerModulePath = `${import.meta.dir}/logger.ts`;
		const script = `
			import { createLogger } from ${JSON.stringify(loggerModulePath)};
			const logger = createLogger();
			logger.info(
				{ token: 'top-level-secret', nested: { token: 'nested-secret' } },
				'test message',
			);
		`;
		const loggerProcess = Bun.spawnSync([process.execPath, '--eval', script], {
			env: { ...process.env, NODE_ENV: 'production' },
		});
		const output = new TextDecoder().decode(loggerProcess.stdout);

		expect(loggerProcess.exitCode).toBe(0);
		expect(output).toContain('"token":"[REDACTED]"');
		expect(output).not.toContain('top-level-secret');
		expect(output).not.toContain('nested-secret');
	});
});
