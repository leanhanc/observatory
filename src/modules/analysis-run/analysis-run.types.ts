import type { BarHistoryPause } from '#modules/bar-history/index.ts';
import type { InstrumentCatalog } from '#modules/instrument-catalog/index.ts';
import type { InstrumentState } from '#modules/instrument-state/index.ts';
import type {
	RegimeTransitionEvent,
	StructureBreakEvent,
	VolatilityExpansionEvent,
} from '#modules/technical-analysis/index.ts';

export type AnalysisEvent = RegimeTransitionEvent | StructureBreakEvent | VolatilityExpansionEvent;

/** One Event and the session on which it was detected. `event.type` is the Event kind. */
export type AnalysisSnapshotEvent = Readonly<{
	sessionDate: string;
	event: AnalysisEvent;
}>;

export type AnalyzedLineFailureReason =
	| 'fetch-failed'
	| 'invalid-bars'
	| 'no-provider-bars'
	| 'no-dollarized-bars';

export type AnalyzedLine =
	| Readonly<{
			status: 'available';
			instrumentId: string;
			tradingLineId: string;
			latestState: InstrumentState;
			events: readonly AnalysisSnapshotEvent[];
			window: Readonly<{
				firstSessionDate: string;
				lastSessionDate: string;
				barCount: number;
			}>;
			sessionsWithoutMepRate: readonly string[];
			/** Peso-line sessions whose range the adapter widened to contain the open and close. */
			rangeRepairSessions: readonly string[];
	  }>
	| Readonly<{
			status: 'unavailable';
			instrumentId: string;
			tradingLineId: string;
			reason: AnalyzedLineFailureReason;
			message: string;
	  }>;

/** One session of one Trading Line, used to report bars the run accepted with a defect. */
export type TradingLineSession = Readonly<{
	tradingLineId: string;
	sessionDate: string;
}>;

export type AnalysisSnapshot = Readonly<{
	schemaVersion: 1;
	ranAt: string;
	requestedThroughSession: string;
	analysisConfigurationVersion: number;
	mepRateSource: Readonly<{
		pesoBondTradingLineId: string;
		dollarBondTradingLineId: string;
		latestRateSessionDate: string;
		/** MEP rate source bars accepted with `open: 0`; the MEP Rate reads only their close. */
		acceptedZeroOpens: readonly TradingLineSession[];
		/** MEP rate source bars whose range the adapter widened to contain the open and close. */
		rangeRepairs: readonly TradingLineSession[];
	}>;
	analyzedLines: readonly AnalyzedLine[];
}>;

export type AnalysisSnapshotWriteResult =
	| Readonly<{ ok: true; locations: readonly string[] }>
	| Readonly<{ ok: false; message: string }>;

export type AnalysisSnapshotStorage = Readonly<{
	write(snapshot: AnalysisSnapshot): Promise<AnalysisSnapshotWriteResult>;
}>;

export type AnalysisRunFailureReason =
	| 'invalid-request'
	| 'mep-rate-source-unavailable'
	| 'no-analyzed-lines'
	| 'snapshot-write-failed';

export type AnalysisRunResult =
	| Readonly<{
			ok: true;
			snapshot: AnalysisSnapshot;
			locations: readonly string[];
	  }>
	| Readonly<{
			ok: false;
			reason: AnalysisRunFailureReason;
			message: string;
	  }>;

export type AnalysisRunRequest = Readonly<{
	requestedThroughSession: string;
}>;

export type AnalysisRunnerOptions = Readonly<{
	fetchFromProvider?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
	pause?: BarHistoryPause;
	getCurrentInstant?: () => string;
	catalog?: InstrumentCatalog;
}>;

export type AnalysisRunner = Readonly<{
	run(request: AnalysisRunRequest): Promise<AnalysisRunResult>;
}>;
