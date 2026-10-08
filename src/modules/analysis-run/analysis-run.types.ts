import type { BarHistoryPause } from '#modules/bar-history/index.ts';
import type { CorporateAction, CorporateActionOutcome } from '#modules/corporate-actions/index.ts';
import type { InstrumentCatalog } from '#modules/instrument-catalog/index.ts';
import type { InstrumentState } from '#modules/instrument-state/index.ts';
import type { LiquidityMeasures } from '#modules/liquidity-eligibility/index.ts';
import type {
	LargeOneSessionMove,
	RegimeTransitionEvent,
	StructureBreakEvent,
	VolatilityExpansionEvent,
} from '#modules/technical-analysis/index.ts';

export type AnalysisEvent = RegimeTransitionEvent | StructureBreakEvent | VolatilityExpansionEvent;

/**
 * One Event and the session on which it was detected. `event.type` is the Event kind.
 * `coincidesWithLargeMove` says the session is a Large One-Session Move, which may be a corporate
 * action rather than market behavior; it is not a claim that it is one.
 */
export type AnalysisSnapshotEvent = Readonly<{
	sessionDate: string;
	event: AnalysisEvent;
	coincidesWithLargeMove: boolean;
}>;

export type AnalyzedLineFailureReason =
	| 'fetch-failed'
	| 'invalid-bars'
	| 'no-provider-bars'
	| 'no-dollarized-bars'
	| 'insufficient-liquidity';

export type AnalyzedLine =
	| (Readonly<{
			status: 'available';
			instrumentId: string;
			tradingLineId: string;
			latestState: InstrumentState;
			events: readonly AnalysisSnapshotEvent[];
			/** Large One-Session Moves of the corrected Dollarized Series, in session order. */
			largeMoves: readonly LargeOneSessionMove[];
			/** The line's listed Corporate Actions and whether each was applied to its bars. */
			corporateActions: readonly CorporateActionOutcome[];
			window: Readonly<{
				firstSessionDate: string;
				lastSessionDate: string;
				barCount: number;
			}>;
			sessionsWithoutMepRate: readonly string[];
	  }> &
			BarRepairs)
	| Readonly<{
			status: 'unavailable';
			instrumentId: string;
			tradingLineId: string;
			reason: Extract<
				AnalyzedLineFailureReason,
				'fetch-failed' | 'invalid-bars' | 'no-provider-bars'
			>;
			message: string;
	  }>
	| (Readonly<{
			status: 'unavailable';
			instrumentId: string;
			tradingLineId: string;
			reason: 'no-dollarized-bars';
			message: string;
	  }> &
			BarRepairs)
	| (Readonly<{
			status: 'unavailable';
			instrumentId: string;
			tradingLineId: string;
			reason: 'insufficient-liquidity';
			message: string;
			/** Both measures over the run's liquidity window, so a reader sees how far it missed. */
			liquidity: LiquidityMeasures;
	  }> &
			BarRepairs);

/**
 * What the run changed in a line's provider bars before using them. A dropped session counts as
 * not traded, so dropped bars can be why a line fails the liquidity gate.
 */
type BarRepairs = Readonly<{
	/** Peso-line sessions whose range the adapter widened to contain the open and close. */
	rangeRepairSessions: readonly string[];
	/** Peso-line sessions whose bar was invalid and was dropped, as if the line had not traded. */
	droppedBarSessions: readonly string[];
}>;

/** One session of one Trading Line, used to report bars the run accepted with a defect. */
export type TradingLineSession = Readonly<{
	tradingLineId: string;
	sessionDate: string;
}>;

export type AnalysisSnapshot = Readonly<{
	schemaVersion: 3;
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
	| 'insufficient-market-sessions'
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

/**
 * A step of a running Analysis Run, reported as it happens. Run-level failures are not reported
 * here; they are the run's result.
 */
export type AnalysisRunProgress =
	| Readonly<{
			type: 'run-started';
			requestedThroughSession: string;
			analyzedLineCount: number;
			analysisConfigurationVersion: number;
	  }>
	| Readonly<{
			type: 'mep-rate-source-fetched';
			requestedThroughSession: string;
			latestRateSessionDate: string;
	  }>
	| Readonly<{
			type: 'line-analyzed';
			/** 1-based position of the line among the analyzed Trading Lines. */
			position: number;
			analyzedLineCount: number;
			line: AnalyzedLine;
	  }>;

export type AnalysisRunnerOptions = Readonly<{
	fetchFromProvider?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
	pause?: BarHistoryPause;
	getCurrentInstant?: () => string;
	catalog?: InstrumentCatalog;
	/** The confirmed Corporate Actions to correct; the committed list by default. */
	corporateActions?: readonly CorporateAction[];
	reportProgress?: (progress: AnalysisRunProgress) => void;
}>;

export type AnalysisRunner = Readonly<{
	run(request: AnalysisRunRequest): Promise<AnalysisRunResult>;
}>;
