// Served by the `provideLatestSnapshot` integration in `src/web/integrations/latest-snapshot.ts`.
declare module 'virtual:observatory/latest-snapshot' {
	import type { AnalysisSnapshotOverview } from '#modules/analysis-run/index.ts';

	const latestSnapshot: AnalysisSnapshotOverview;
	export default latestSnapshot;
}
