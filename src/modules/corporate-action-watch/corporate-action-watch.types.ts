import type { watchRulesSchema } from './corporate-action-watch.schema.ts';
import type * as v from 'valibot';

/** The committed publisher names, aliases and event phrases the watch matches notices with. */
export type WatchRules = v.InferOutput<typeof watchRulesSchema>;

export type WatchRulesValidation =
	| Readonly<{ isValid: true; rules: WatchRules }>
	| Readonly<{
			isValid: false;
			issues: readonly Readonly<{ code: 'invalid-rules'; path: string; message: string }>[];
	  }>;

/** One row of Open BYMADATA's relevant-facts feed, in the feed's own terms. */
export type RelevantFact = Readonly<{
	/** The publisher's BYMA Especie; for a CEDEAR notice it names the program issuer, if any. */
	especie: string;
	/** Buenos Aires wall-clock publication time, `YYYY-MM-DDTHH:MM:SS`. */
	publishedAt: string;
	documentId: number;
	title: string;
	emisor: string;
}>;

/** An analyzed Trading Line the watch looks for. */
export type WatchedTradingLine = Readonly<{
	tradingLineId: string;
	symbol: string;
	instrumentType: 'stock' | 'cedear';
}>;

export type CorporateActionNotice = Readonly<{
	documentId: number;
	publishedAt: string;
	title: string;
	pdfUrl: string;
	/**
	 * The Corporate Action list has an entry for the notice's line with an ex-date from 10 days
	 * before to 70 days after the notice's publication date.
	 */
	isListed: boolean;
}>;

/**
 * Every Corporate Action Notice for one line within the watched window, so one event's
 * announcement and follow-ups are one candidate.
 */
export type CorporateActionCandidate = Readonly<{
	tradingLineId: string;
	notices: readonly CorporateActionNotice[];
}>;

export type CorporateActionWatch =
	| Readonly<{
			status: 'available';
			publishedFrom: string;
			publishedThrough: string;
			candidates: readonly CorporateActionCandidate[];
	  }>
	| Readonly<{
			status: 'unavailable';
			publishedFrom: string;
			publishedThrough: string;
			message: string;
	  }>;

export type RelevantFactsFetch = (
	input: string | URL | Request,
	init?: RequestInit,
) => Promise<Response>;
