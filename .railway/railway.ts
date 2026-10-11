import { bucket, defineRailway, github, preserve, project, ref, service } from 'railway/iac';

// Watch patterns are gitignore-style and matched from the repository root. Each service watches what
// its build or start reads; tests are read by neither.
const SHARED_WATCH_PATTERNS = ['/src/analysis/**', '/package.json', '/bun.lock', '/tsconfig.json'];
const TEST_FILES_WATCH_PATTERN = '!/src/**/*.test.ts';

/**
 * The Observatory project on Railway. `railway config plan` previews changes to the linked
 * environment and `railway config apply` applies them.
 */
export default defineRailway(() => {
	// Holds Bar Histories and Analysis Snapshots. A bucket's region cannot change after creation.
	const historyBars = bucket('history-bars', { region: 'iad' });
	const storageEnvironment = {
		OBSERVATORY_STORAGE_ACCESS_KEY_ID: ref(historyBars, 'ACCESS_KEY_ID'),
		OBSERVATORY_STORAGE_SECRET_ACCESS_KEY: ref(historyBars, 'SECRET_ACCESS_KEY'),
		OBSERVATORY_STORAGE_BUCKET: ref(historyBars, 'BUCKET'),
		OBSERVATORY_STORAGE_ENDPOINT: ref(historyBars, 'ENDPOINT'),
		OBSERVATORY_STORAGE_REGION: ref(historyBars, 'REGION'),
		// Bun's S3 client fails against this endpoint with virtual-hosted URLs; path style works.
		OBSERVATORY_STORAGE_VIRTUAL_HOSTED_STYLE: 'false',
	};

	// The public site. The build reads the latest snapshot from the bucket and prerenders every page;
	// Railpack detects the static Astro build and serves `dist` with Caddy, with no server process. A
	// start command would turn that static mode off. A failed build keeps the previous deployment
	// serving.
	const web = service('web', {
		source: github('leanhanc/observatory', { branch: 'main' }),
		build: {
			buildCommand: 'bun run build',
			watchPatterns: [
				...SHARED_WATCH_PATTERNS,
				'/src/web/**',
				'/src/server/bar-history-storage-configuration/**',
				'/astro.config.ts',
				'/Caddyfile',
				TEST_FILES_WATCH_PATTERN,
			],
		},
		env: storageEnvironment,
	});

	// The daily Analysis Run: a cron job that analyzes the previous Buenos Aires session and exits.
	// Railway schedules in UTC; 09:00 UTC is 06:00 in Buenos Aires (no DST), Tuesday to Saturday.
	// A failed run is not restarted, so it stays visible; the next run fetches the full window anyway.
	const analysisRun = service('analysis-run', {
		source: github('leanhanc/observatory', { branch: 'main' }),
		build: {
			watchPatterns: [...SHARED_WATCH_PATTERNS, '/src/server/**', TEST_FILES_WATCH_PATTERN],
		},
		// Runs the script directly: `bun run` would add its own stderr lines, which Railway shows as errors.
		start: 'bun src/server/analysis-run/analysis-run.ts',
		deploy: {
			cronSchedule: '0 9 * * 2-6',
			restartPolicyType: 'NEVER',
		},
		env: {
			...storageEnvironment,
			// After writing the snapshot, the run deploys `web` so that its build renders it. The
			// project token is set by hand in Railway and kept by `preserve()`.
			OBSERVATORY_RAILWAY_TOKEN: preserve(),
			OBSERVATORY_WEB_SERVICE_ID: web.env.RAILWAY_SERVICE_ID,
			OBSERVATORY_WEB_ENVIRONMENT_ID: web.env.RAILWAY_ENVIRONMENT_ID,
			// Selects the logger's JSON output.
			NODE_ENV: 'production',
		},
	});

	return project('Observatory', {
		resources: [historyBars, web, analysisRun],
	});
});
