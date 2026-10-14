import * as v from 'valibot';

import type { AnalysisRunLog } from './analysis-run.ts';

const RAILWAY_API_URL = 'https://backboard.railway.com/graphql/v2';
const RAILWAY_REQUEST_TIMEOUT_MS = 20_000;
// Deploys `web` at the run's commit, whose code wrote the snapshot, so the build reads the snapshot
// schema its code expects. Railway rejects a commit its connected repository does not have.
// Returns the deployment ID.
const DEPLOY_AT_COMMIT_MUTATION = `mutation deployWebAtCommit($serviceId: String!, $environmentId: String!, $commitSha: String!) {
	serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId, commitSha: $commitSha)
}`;
// Without a commit, Railway deploys the commit of the service's last successful deployment, which
// predates a schema bump whose web build failed.
const DEPLOY_CURRENT_COMMIT_MUTATION = `mutation deployWeb($serviceId: String!, $environmentId: String!) {
	serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId)
}`;
const REQUIRED_ENVIRONMENT_VARIABLES = [
	'OBSERVATORY_RAILWAY_TOKEN',
	'OBSERVATORY_WEB_SERVICE_ID',
	'OBSERVATORY_WEB_ENVIRONMENT_ID',
] as const;
const SNAPSHOT_STILL_WRITTEN = 'The snapshot is written; the site shows it after its next deploy.';

// Railway reports GraphQL failures, authorization included, as `errors` in an HTTP 200 answer.
const deployResponseSchema = v.object({
	data: v.optional(v.nullable(v.object({ serviceInstanceDeployV2: v.optional(v.string()) }))),
	errors: v.optional(v.array(v.object({ message: v.string() }))),
});

export type FetchFromRailway = (url: string, init: RequestInit) => Promise<Response>;

export type WebRedeployRequest = Readonly<{
	environment: Readonly<Record<string, string | undefined>>;
	log: AnalysisRunLog;
	/** `fetch` by default. */
	fetchFromRailway?: FetchFromRailway | undefined;
}>;

type DeployResult = Readonly<{ ok: true; deploymentId: string } | { ok: false; reason: string }>;

/**
 * Asks Railway once to deploy the web service, so that its build prerenders the snapshot the run
 * just wrote, and logs the outcome. Never throws: a missing variable or a failed request is a
 * warning, because the snapshot is already written.
 *
 * Pins the deploy to the run's commit, `RAILWAY_GIT_COMMIT_SHA`, which Railway sets on deploys
 * triggered from GitHub. Without it, the deploy is not pinned and the log says so.
 *
 * Reads a project token from `OBSERVATORY_RAILWAY_TOKEN` and the IDs from
 * `OBSERVATORY_WEB_SERVICE_ID` and `OBSERVATORY_WEB_ENVIRONMENT_ID`. The token is sent only in the
 * request header and never logged.
 */
export async function redeployWebService(request: WebRedeployRequest): Promise<void> {
	const { environment, log, fetchFromRailway = fetch } = request;
	const missingVariables = REQUIRED_ENVIRONMENT_VARIABLES.filter(
		(name) => !environment[name]?.trim(),
	);

	if (missingVariables.length > 0) {
		log.warn(
			{ event: 'web-redeploy-skipped', missingVariables },
			`Web redeploy not configured; missing ${missingVariables.join(', ')}. ${SNAPSHOT_STILL_WRITTEN}`,
		);
		return;
	}

	const runCommitSha = environment.RAILWAY_GIT_COMMIT_SHA?.trim() ?? '';
	const hasRunCommit = runCommitSha !== '';
	const commitSha = hasRunCommit ? runCommitSha : null;
	const result = await requestDeploy(fetchFromRailway, {
		token: environment.OBSERVATORY_RAILWAY_TOKEN!,
		serviceId: environment.OBSERVATORY_WEB_SERVICE_ID!,
		environmentId: environment.OBSERVATORY_WEB_ENVIRONMENT_ID!,
		commitSha,
	});

	if (!result.ok) {
		log.warn(
			{ event: 'web-redeploy-failed', reason: result.reason },
			`Web redeploy failed: ${result.reason} ${SNAPSHOT_STILL_WRITTEN}`,
		);
		return;
	}

	const deployedCommit =
		commitSha === null
			? 'not pinned to a commit (RAILWAY_GIT_COMMIT_SHA is not set)'
			: `at commit ${commitSha}`;

	log.info(
		{ event: 'web-redeploy-requested', deploymentId: result.deploymentId, commitSha },
		`Web redeploy requested: deployment ${result.deploymentId}, ${deployedCommit}.`,
	);
}

async function requestDeploy(
	fetchFromRailway: FetchFromRailway,
	target: Readonly<{
		token: string;
		serviceId: string;
		environmentId: string;
		commitSha: string | null;
	}>,
): Promise<DeployResult> {
	const { token, serviceId, environmentId, commitSha } = target;
	const deployRequest =
		commitSha === null
			? { query: DEPLOY_CURRENT_COMMIT_MUTATION, variables: { serviceId, environmentId } }
			: {
					query: DEPLOY_AT_COMMIT_MUTATION,
					variables: { serviceId, environmentId, commitSha },
				};
	let response: Response;

	try {
		response = await fetchFromRailway(RAILWAY_API_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'Project-Access-Token': token },
			body: JSON.stringify(deployRequest),
			signal: AbortSignal.timeout(RAILWAY_REQUEST_TIMEOUT_MS),
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { ok: false, reason: `the request failed (${message}).` };
	}

	if (!response.ok) {
		return { ok: false, reason: `Railway answered HTTP ${response.status}.` };
	}

	return readDeployResponse(response);
}

async function readDeployResponse(response: Response): Promise<DeployResult> {
	let body: unknown;

	try {
		body = await response.json();
	} catch {
		return { ok: false, reason: 'Railway answered with invalid JSON.' };
	}

	const parse = v.safeParse(deployResponseSchema, body);

	if (!parse.success) {
		return { ok: false, reason: 'Railway answered with an unexpected shape.' };
	}

	const { data, errors = [] } = parse.output;
	const deploymentId = data?.serviceInstanceDeployV2;

	if (errors.length > 0) {
		const messages = errors.map(({ message }) => message).join('; ');
		return { ok: false, reason: `Railway answered: ${messages}.` };
	}

	if (deploymentId === undefined) {
		return { ok: false, reason: 'Railway answered without a deployment ID.' };
	}

	return { ok: true, deploymentId };
}
