import { bucket, defineRailway, github, project, ref, service } from 'railway/iac';

/**
 * The Observatory project on Railway. `railway config plan` previews changes to the linked
 * environment and `railway config apply` applies them.
 */
export default defineRailway(() => {
	// Holds Bar Histories and Analysis Snapshots. A bucket's region cannot change after creation.
	const historyBars = bucket('history-bars', { region: 'iad' });

	// The daily Analysis Run: a cron job that analyzes the previous Buenos Aires session and exits.
	// Railway schedules in UTC; 09:00 UTC is 06:00 in Buenos Aires (no DST), Tuesday to Saturday.
	// A failed run is not restarted, so it stays visible; the next run fetches the full window anyway.
	const analysisRun = service('analysis-run', {
		source: github('leanhanc/observatory', { branch: 'main' }),
		// Runs the script directly: `bun run` would add its own stderr lines, which Railway shows as errors.
		start: 'bun scripts/analysis-run.ts',
		deploy: {
			cronSchedule: '0 9 * * 2-6',
			restartPolicyType: 'NEVER',
		},
		env: {
			OBSERVATORY_STORAGE_ACCESS_KEY_ID: ref(historyBars, 'ACCESS_KEY_ID'),
			OBSERVATORY_STORAGE_SECRET_ACCESS_KEY: ref(historyBars, 'SECRET_ACCESS_KEY'),
			OBSERVATORY_STORAGE_BUCKET: ref(historyBars, 'BUCKET'),
			OBSERVATORY_STORAGE_ENDPOINT: ref(historyBars, 'ENDPOINT'),
			OBSERVATORY_STORAGE_REGION: ref(historyBars, 'REGION'),
			// Bun's S3 client fails against this endpoint with virtual-hosted URLs; path style works.
			OBSERVATORY_STORAGE_VIRTUAL_HOSTED_STYLE: 'false',
			// Selects the logger's JSON output.
			NODE_ENV: 'production',
		},
	});

	return project('Observatory', {
		resources: [historyBars, analysisRun],
	});
});
