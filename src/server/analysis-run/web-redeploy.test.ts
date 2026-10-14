import { describe, expect, test } from 'bun:test';

import { redeployWebService } from './web-redeploy.ts';

import type { AnalysisRunLog } from './analysis-run.ts';
import type { FetchFromRailway } from './web-redeploy.ts';

const TOKEN_SENTINEL = 'sentinel-railway-token-4d1e';
const CONFIGURED_ENVIRONMENT = {
	OBSERVATORY_RAILWAY_TOKEN: TOKEN_SENTINEL,
	OBSERVATORY_WEB_SERVICE_ID: 'web-service-id',
	OBSERVATORY_WEB_ENVIRONMENT_ID: 'production-environment-id',
};
const RUN_COMMIT_SHA = 'd0beb8f5c55b36df7d674d55965a23b8d54ad69b';
const SNAPSHOT_STILL_WRITTEN = 'The snapshot is written; the site shows it after its next deploy.';

describe('web redeploy', () => {
	test('requests a deploy of the web service at the run commit and logs its ID', async () => {
		const { entries, requests } = await redeployWith(
			{ ...CONFIGURED_ENVIRONMENT, RAILWAY_GIT_COMMIT_SHA: RUN_COMMIT_SHA },
			answerJson({ data: { serviceInstanceDeployV2: 'deployment-1' } }),
		);
		const [request] = requests;
		const body = readDeployBody(request!);
		const headers = new Headers(request!.init.headers);

		expect(requests).toHaveLength(1);
		expect(request!.url).toBe('https://backboard.railway.com/graphql/v2');
		expect(request!.init.method).toBe('POST');
		expect(request!.init.signal).toBeInstanceOf(AbortSignal);
		expect(headers.get('Project-Access-Token')).toBe(TOKEN_SENTINEL);
		expect(headers.get('Authorization')).toBeNull();
		expect(body.query).toContain('commitSha: $commitSha)');
		expect(body.variables).toEqual({
			serviceId: 'web-service-id',
			environmentId: 'production-environment-id',
			commitSha: RUN_COMMIT_SHA,
		});
		expect(entries).toEqual([
			{
				level: 'info',
				message: `Web redeploy requested: deployment deployment-1, at commit ${RUN_COMMIT_SHA}.`,
				fields: {
					event: 'web-redeploy-requested',
					deploymentId: 'deployment-1',
					commitSha: RUN_COMMIT_SHA,
				},
			},
		]);
	});

	test.each([
		['is not set', CONFIGURED_ENVIRONMENT],
		['is blank', { ...CONFIGURED_ENVIRONMENT, RAILWAY_GIT_COMMIT_SHA: ' ' }],
	])(
		'requests an unpinned deploy and says so when the run commit %s',
		async (_case, environment) => {
			const { entries, requests } = await redeployWith(
				environment,
				answerJson({ data: { serviceInstanceDeployV2: 'deployment-1' } }),
			);
			const body = readDeployBody(requests[0]!);

			expect(requests).toHaveLength(1);
			expect(body.query).toContain('serviceInstanceDeployV2(');
			expect(body.query).not.toContain('commitSha');
			expect(body.variables).toEqual({
				serviceId: 'web-service-id',
				environmentId: 'production-environment-id',
			});
			expect(entries).toEqual([
				{
					level: 'info',
					message:
						'Web redeploy requested: deployment deployment-1, not pinned to a commit (RAILWAY_GIT_COMMIT_SHA is not set).',
					fields: {
						event: 'web-redeploy-requested',
						deploymentId: 'deployment-1',
						commitSha: null,
					},
				},
			]);
		},
	);

	test('sends nothing and names the missing variables when it is not configured', async () => {
		const { entries, requests } = await redeployWith(
			{ ...CONFIGURED_ENVIRONMENT, OBSERVATORY_RAILWAY_TOKEN: ' ' },
			answerJson({ data: { serviceInstanceDeployV2: 'deployment-1' } }),
		);

		expect(requests).toHaveLength(0);
		expect(entries).toEqual([
			{
				level: 'warn',
				message: `Web redeploy not configured; missing OBSERVATORY_RAILWAY_TOKEN. ${SNAPSHOT_STILL_WRITTEN}`,
				fields: {
					event: 'web-redeploy-skipped',
					missingVariables: ['OBSERVATORY_RAILWAY_TOKEN'],
				},
			},
		]);
	});

	test('names every missing variable', async () => {
		const { entries } = await redeployWith(
			{},
			answerJson({ data: { serviceInstanceDeployV2: 'deployment-1' } }),
		);

		expect(entries[0]!.message).toBe(
			`Web redeploy not configured; missing OBSERVATORY_RAILWAY_TOKEN, OBSERVATORY_WEB_SERVICE_ID, OBSERVATORY_WEB_ENVIRONMENT_ID. ${SNAPSHOT_STILL_WRITTEN}`,
		);
	});

	test('warns when Railway refuses the request in an HTTP 200 answer', async () => {
		const { entries } = await redeployWith(
			CONFIGURED_ENVIRONMENT,
			answerJson({
				data: null,
				errors: [
					{ message: 'Not Authorized', extensions: { code: 'INTERNAL_SERVER_ERROR' } },
				],
			}),
		);

		expect(entries).toEqual([
			{
				level: 'warn',
				message: `Web redeploy failed: Railway answered: Not Authorized. ${SNAPSHOT_STILL_WRITTEN}`,
				fields: {
					event: 'web-redeploy-failed',
					reason: 'Railway answered: Not Authorized.',
				},
			},
		]);
	});

	test('warns when Railway does not know the run commit', async () => {
		const { entries } = await redeployWith(
			{ ...CONFIGURED_ENVIRONMENT, RAILWAY_GIT_COMMIT_SHA: RUN_COMMIT_SHA },
			answerJson({ data: null, errors: [{ message: 'Commit not found' }] }),
		);

		expect(entries).toEqual([
			{
				level: 'warn',
				message: `Web redeploy failed: Railway answered: Commit not found. ${SNAPSHOT_STILL_WRITTEN}`,
				fields: {
					event: 'web-redeploy-failed',
					reason: 'Railway answered: Commit not found.',
				},
			},
		]);
	});

	test.each([
		[
			'an HTTP error',
			() => Promise.resolve(new Response('unavailable', { status: 503 })),
			'Railway answered HTTP 503.',
		],
		[
			'a request that throws',
			() => Promise.reject(new Error('The operation timed out.')),
			'the request failed (The operation timed out.).',
		],
		[
			'invalid JSON',
			() => Promise.resolve(new Response('<html>', { status: 200 })),
			'Railway answered with invalid JSON.',
		],
		[
			'an answer without a deployment ID',
			answerJson({ data: {} }),
			'Railway answered without a deployment ID.',
		],
	] satisfies [string, FetchFromRailway, string][])(
		'warns on %s',
		async (_case, fetchFromRailway, reason) => {
			const { entries } = await redeployWith(CONFIGURED_ENVIRONMENT, fetchFromRailway);

			expect(entries).toEqual([
				{
					level: 'warn',
					message: `Web redeploy failed: ${reason} ${SNAPSHOT_STILL_WRITTEN}`,
					fields: { event: 'web-redeploy-failed', reason },
				},
			]);
		},
	);

	test('never logs the token', async () => {
		const results = await Promise.all([
			redeployWith(CONFIGURED_ENVIRONMENT, () => Promise.reject(new Error('refused'))),
			redeployWith(CONFIGURED_ENVIRONMENT, answerJson({ errors: [{ message: 'Bad' }] })),
			redeployWith(
				CONFIGURED_ENVIRONMENT,
				answerJson({ data: { serviceInstanceDeployV2: 'deployment-1' } }),
			),
		]);
		const serializedLog = JSON.stringify(results.map(({ entries }) => entries));

		expect(serializedLog).not.toContain(TOKEN_SENTINEL);
	});
});

type LogEntry = Readonly<{ level: 'info' | 'warn' | 'error'; message: string; fields: object }>;
type RecordedRequest = Readonly<{ url: string; init: RequestInit }>;

async function redeployWith(
	environment: Readonly<Record<string, string>>,
	answer: FetchFromRailway,
): Promise<Readonly<{ entries: readonly LogEntry[]; requests: readonly RecordedRequest[] }>> {
	const entries: LogEntry[] = [];
	const requests: RecordedRequest[] = [];
	const recordAt =
		(level: LogEntry['level']) =>
		(fields: object, message: string): void => {
			entries.push({ level, message, fields });
		};
	const log: AnalysisRunLog = {
		info: recordAt('info'),
		warn: recordAt('warn'),
		error: recordAt('error'),
	};
	const fetchFromRailway: FetchFromRailway = (url, init) => {
		requests.push({ url, init });
		return answer(url, init);
	};

	await redeployWebService({ environment, log, fetchFromRailway });

	return { entries, requests };
}

function readDeployBody(request: RecordedRequest): Readonly<{ query: string; variables: object }> {
	return JSON.parse(request.init.body as string) as { query: string; variables: object };
}

function answerJson(body: object): FetchFromRailway {
	return () => Promise.resolve(Response.json(body));
}
