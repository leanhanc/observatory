import type { BarHistoryPause } from '#modules/bar-history/index.ts';
import type { ChartSeries } from '#modules/chart-series/index.ts';
import type { CorporateActionWatch, WatchRules } from '#modules/corporate-action-watch/index.ts';
import type { CorporateAction, CorporateActionOutcome } from '#modules/corporate-actions/index.ts';
import type { InstrumentCatalog } from '#modules/instrument-catalog/index.ts';
import type { InstrumentState } from '#modules/instrument-state/index.ts';
import type { LiquidityMeasures } from '#modules/liquidity-eligibility/index.ts';
import type { PeriodReturn } from '#modules/period-returns/index.ts';
import type {
	LargeOneSessionMove,
	RegimeTransitionEvent,
	StructureBreakEvent,
	VolatileSessionEvent,
} from '#modules/technical-analysis/index.ts';
import type { analysisSnapshotOverviewSchema } from './analysis-snapshot.schema.ts';
import type * as v from 'valibot';

/**
 * A Structure Break's prices in pesos at its own session's MEP Rate, the rate that dollarized the
 * bar it was detected on. The close and the swing share that rate, so the close is beyond the swing
 * in pesos exactly when it is in MEP dollars.
 */
export type StructureBreakPesoEquivalents = Readonly<{
	/** Pesos per MEP dollar on the Event's session. */
	mepRate: number;
	/**
	 * The line's peso close on the Event's session, corrected for corporate actions; not a
	 * conversion.
	 */
	closePrice: number;
	definingSwingPrice: number;
}>;

/**
 * A Structure Break's prices in CCL dollars at its own session's CCL Rate: the peso prices divided
 * by it, so the close is beyond the swing in CCL dollars exactly when it is in pesos.
 */
export type StructureBreakCclEquivalents = Readonly<{
	/** Pesos per CCL dollar on the Event's session. */
	cclRate: number;
	closePrice: number;
	definingSwingPrice: number;
}>;

export type SnapshotStructureBreakEvent = StructureBreakEvent &
	Readonly<{
		pesoEquivalents: StructureBreakPesoEquivalents;
		/** `null` when the Event's session has no CCL Rate; no other session's rate stands in. */
		cclEquivalents: StructureBreakCclEquivalents | null;
	}>;

/** Only Structure Breaks carry peso prices: the other kinds show no price. */
export type AnalysisEvent =
	| RegimeTransitionEvent
	| SnapshotStructureBreakEvent
	| VolatileSessionEvent;

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
			latestClose: LatestClose;
			/**
			 * The close's change over each configured window of calendar months, as of `latestState`,
			 * in MEP dollars.
			 */
			periodReturns: readonly PeriodReturn[];
			/** The same windows in pesos, devaluation included: what a holder of the peso line got. */
			pesoPeriodReturns: readonly PeriodReturn[];
			/** The same windows in CCL dollars; unavailable when an endpoint session has no CCL Rate. */
			cclPeriodReturns: readonly PeriodReturn[];
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
			pesoEquivalents: PesoEquivalents;
			/** `null` when the latest State's session has no CCL Rate. */
			cclEquivalents: CclEquivalents | null;
			watchDistances: WatchDistances;
			/** The line's candles in each display currency, rounded for display; no analysis reads them. */
			chartSeries: ChartSeries;
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
			/**
			 * The line's listed Corporate Actions and whether each was applied before the gate. A
			 * volume-only correction exists to change the gate's result.
			 */
			corporateActions: readonly CorporateActionOutcome[];
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

/**
 * The latest State's session in pesos, for a reader who trades the peso line. Levels are converted
 * at that one session's MEP Rate; at another session's rate the same level has another peso price.
 */
export type PesoEquivalents = Readonly<{
	sessionDate: string;
	/** Pesos per MEP dollar on `sessionDate`: the rate that dollarized that session's bar. */
	mepRate: number;
	/** The line's corrected peso close on `sessionDate`: a market fact, not a conversion. */
	close: number;
	lastConfirmedSwingHigh: number | null;
	lastConfirmedSwingLow: number | null;
	/** The State's Regime tipping closes at `mepRate`, or `null` while Regime is unavailable. */
	regimeTippingCloses: Readonly<{ bullishCloseAbove: number; bearishCloseBelow: number }> | null;
	/** The State's long-term EMA at `mepRate`, or `null` while it is unavailable. */
	longTermEma: number | null;
}>;

/**
 * The latest State's session in CCL dollars: each `PesoEquivalents` value divided by that session's
 * CCL Rate. For display only.
 */
export type CclEquivalents = Readonly<{
	sessionDate: string;
	/** Pesos per CCL dollar on `sessionDate`. */
	cclRate: number;
	/** The line's corrected peso close on `sessionDate` divided by `cclRate`. */
	close: number;
	lastConfirmedSwingHigh: number | null;
	lastConfirmedSwingLow: number | null;
	regimeTippingCloses: Readonly<{ bullishCloseAbove: number; bearishCloseBelow: number }> | null;
	longTermEma: number | null;
}>;

/**
 * How far the latest State's close would have to move to reach each watch level, in percent of the
 * close: `(level − close) / close × 100`, positive for a level above the close. Each is `null` when
 * its level is. One session's rate converts the close and its levels, so the figure is the same in
 * every currency.
 */
export type WatchDistances = Readonly<{
	lastConfirmedSwingHigh: number | null;
	lastConfirmedSwingLow: number | null;
	bullishCloseAbove: number | null;
	bearishCloseBelow: number | null;
}>;

/**
 * The latest State's close and its change since the line's previous session, in one currency.
 * `previousClose`, `change` and `percentChange` are `null` together, when there is no previous
 * session or it has no rate in this currency.
 */
export type CloseChange = Readonly<{
	close: number;
	previousClose: number | null;
	/** `close − previousClose`, unrounded. */
	change: number | null;
	/** `change / previousClose × 100`, unrounded. */
	percentChange: number | null;
}>;

/**
 * The latest State's close in each currency and its day change. Each previous close is converted
 * at its own session's rate, so a dollar change leaves out the peso's move between the sessions.
 */
export type LatestClose = Readonly<{
	sessionDate: string;
	/** The line's last peso bar before `sessionDate`, whether or not it had a rate. */
	previousSessionDate: string | null;
	peso: CloseChange;
	mep: CloseChange;
	/** `null` when `sessionDate` has no CCL Rate, as `cclEquivalents` is. */
	ccl: CloseChange | null;
}>;

/** One session of one Trading Line, used to report bars the run accepted with a defect. */
export type TradingLineSession = Readonly<{
	tradingLineId: string;
	sessionDate: string;
}>;

/** The unit of every price and price-denominated measurement in a snapshot. */
export type PriceUnit = 'mep-dollar';

export type AnalysisSnapshot = Readonly<{
	schemaVersion: 13;
	priceUnit: PriceUnit;
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
	/** Where every CCL figure comes from, or `null` when the run had no CCL Rate. */
	cclRateSource: Readonly<{
		pesoBondTradingLineId: string;
		cableBondTradingLineId: string;
		latestRateSessionDate: string;
	}> | null;
	analyzedLines: readonly AnalyzedLine[];
	/** Notices that may announce a Corporate Action for an analyzed line; never applied. */
	corporateActionWatch: CorporateActionWatch;
}>;

export type AnalysisSnapshotWriteResult =
	| Readonly<{ ok: true; locations: readonly string[] }>
	| Readonly<{ ok: false; message: string }>;

export type AnalysisSnapshotStorage = Readonly<{
	write(snapshot: AnalysisSnapshot): Promise<AnalysisSnapshotWriteResult>;
}>;

/** The validated part of an Analysis Snapshot that the web reads. */
export type AnalysisSnapshotOverview = v.InferOutput<typeof analysisSnapshotOverviewSchema>;

export type LatestAnalysisSnapshotReadResult =
	| Readonly<{ ok: true; snapshot: AnalysisSnapshotOverview }>
	| Readonly<{
			ok: false;
			reason: 'not-found' | 'read-failed' | 'invalid-snapshot';
			message: string;
	  }>;

/** Snapshot storage in the bucket, which public pages also read the latest snapshot from. */
export type AnalysisSnapshotBucketStorage = AnalysisSnapshotStorage &
	Readonly<{
		readLatest(): Promise<LatestAnalysisSnapshotReadResult>;
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
			type: 'ccl-rate-derived';
			latestRateSessionDate: string;
			cclRate: number;
			/** A later MEP Rate session leaves the lines that traded on it without CCL figures. */
			latestMepRateSessionDate: string;
	  }>
	| Readonly<{
			/** The CCL Rate is for display only, so the run goes on without it. */
			type: 'ccl-rate-unavailable';
			message: string;
	  }>
	| Readonly<{
			type: 'fetch-retry-started';
			scope: 'mep-rate-source' | 'analyzed-lines';
			/** 1-based number of this retry among the `retryCount` the scope allows. */
			retry: number;
			retryCount: number;
			coolDownMs: number;
			failures: readonly Readonly<{ tradingLineId: string; message: string }>[];
	  }>
	| Readonly<{
			/** The retry cut-off was reached; these lines keep their main-pass failure. */
			type: 'fetch-retry-stopped';
			tradingLineIds: readonly string[];
	  }>
	| Readonly<{
			/** The watch ran, available or not, after every line was analyzed. */
			type: 'corporate-action-watch-checked';
			watch: CorporateActionWatch;
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
	/** The corporate-action watch's matching rules; the committed rules by default. */
	watchRules?: WatchRules;
	reportProgress?: (progress: AnalysisRunProgress) => void;
	/**
	 * Run time after which no analyzed line is retried, so that retries cannot push the run past
	 * its caller's deadline. No cut-off by default.
	 */
	retryCutoffMs?: number;
}>;

export type AnalysisRunner = Readonly<{
	run(request: AnalysisRunRequest): Promise<AnalysisRunResult>;
}>;
