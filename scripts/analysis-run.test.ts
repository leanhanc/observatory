import { describe, expect, test } from 'bun:test';

import { resolveAnalysisRunInvocation } from './analysis-run.ts';

describe('Analysis Run command', () => {
	test('requires an explicit real Requested-Through Session', () => {
		expect(() => resolveAnalysisRunInvocation(['--output', 'snapshot.json'], {})).toThrow(
			'--through-session must be a real YYYY-MM-DD date.',
		);
		expect(() =>
			resolveAnalysisRunInvocation(
				['--through-session', '2026-02-30', '--output', 'x.json'],
				{},
			),
		).toThrow('--through-session must be a real YYYY-MM-DD date.');
	});

	test('rejects an empty output path instead of writing to the bucket', () => {
		expect(() =>
			resolveAnalysisRunInvocation(['--through-session', '2026-10-02', '--output='], {}),
		).toThrow('--output must be a file path.');
	});

	test('requires storage configuration unless writing to a local file', () => {
		expect(() => resolveAnalysisRunInvocation(['--through-session', '2026-10-02'], {})).toThrow(
			'Missing storage configuration',
		);
		expect(
			resolveAnalysisRunInvocation(
				['--through-session', '2026-10-02', '--output', 'snapshot.json'],
				{},
			).requestedThroughSession,
		).toBe('2026-10-02');
	});
});
