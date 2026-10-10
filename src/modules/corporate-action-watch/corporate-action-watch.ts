import * as v from 'valibot';

import { mapValibotIssues } from '#lib/utils/validation.ts';

import { watchRulesSchema } from './corporate-action-watch.schema.ts';
import { buildDocumentDownloadUrl, fetchRelevantFacts } from './relevant-facts-feed.ts';

import type { CorporateAction } from '#modules/corporate-actions/index.ts';
import type {
	CorporateActionCandidate,
	CorporateActionNotice,
	CorporateActionWatch,
	RelevantFact,
	RelevantFactsFetch,
	WatchRules,
	WatchRulesValidation,
	WatchedTradingLine,
} from './corporate-action-watch.types.ts';
import type { PublicationWindow } from './relevant-facts-feed.ts';

// The run looks back over a week ending on the Requested-Through Session, so a notice published on
// a non-trading day, or after one run's cut-off, is still seen by the next run.
const WATCHED_CALENDAR_DAYS = 7;
// A notice can precede the ex-date by a week or more, or come on it, so an entry this close to any
// of a line's notices is taken to be the same event.
const LISTED_EX_DATE_DISTANCE_DAYS = 10;
// Publishers separate a title's ticker, name and event with " - ", a colon or parentheses.
const TITLE_SEPARATOR_PATTERN = / - |:|\(|\)/;
const CEDEAR_TITLE_PATTERN = /cedear/i;

export type WatchCorporateActionsRequest = Readonly<{
	fetchFromProvider: RelevantFactsFetch;
	requestedThroughSession: string;
	tradingLines: readonly WatchedTradingLine[];
	corporateActions: readonly CorporateAction[];
	rules: WatchRules;
}>;

/** Validates a watch rules value, such as the parsed committed data file. */
export function validateWatchRules(value: unknown): WatchRulesValidation {
	const validation = v.safeParse(watchRulesSchema, value);

	if (!validation.success) {
		return {
			isValid: false,
			issues: mapValibotIssues(validation.issues, () => 'invalid-rules'),
		};
	}

	return { isValid: true, rules: validation.output };
}

/**
 * Fetches the week of relevant facts ending on the Requested-Through Session and finds the
 * Corporate Action Notices for the given lines. A feed failure is returned as an unavailable watch,
 * never thrown. Notice documents are never downloaded.
 */
export async function watchCorporateActions(
	request: WatchCorporateActionsRequest,
): Promise<CorporateActionWatch> {
	const { fetchFromProvider, requestedThroughSession, tradingLines, corporateActions, rules } =
		request;
	const window = resolvePublicationWindow(requestedThroughSession);
	const feed = await fetchRelevantFacts(fetchFromProvider, window);

	if (!feed.ok) {
		return { status: 'unavailable', ...window, message: feed.message };
	}

	const candidates = findCorporateActionCandidates(
		feed.facts,
		tradingLines,
		corporateActions,
		rules,
	);
	return { status: 'available', ...window, candidates };
}

/**
 * Keeps the facts whose title announces a price-scaling event, matches them to lines by publisher
 * and title, and groups each line's notices into one candidate, in the lines' order.
 */
export function findCorporateActionCandidates(
	facts: readonly RelevantFact[],
	tradingLines: readonly WatchedTradingLine[],
	corporateActions: readonly CorporateAction[],
	rules: WatchRules,
): readonly CorporateActionCandidate[] {
	const eventPatterns = rules.eventPhrases.map(createWholeWordsPattern);
	const eventFacts = facts.filter((fact) =>
		checkIfTitleAnnouncesEvent(fact, eventPatterns, rules),
	);

	return tradingLines.flatMap((line) => {
		const lineFacts = eventFacts.filter((fact) => checkIfFactConcernsLine(fact, line, rules));

		if (lineFacts.length === 0) {
			return [];
		}

		const notices = lineFacts.toSorted(compareFactsByPublication).map(createNotice);
		const lineActions = corporateActions.filter(
			(action) => action.tradingLineId === line.tradingLineId,
		);
		const isListed = lineActions.some((action) => checkIfActionIsNear(action, notices));

		return [{ tradingLineId: line.tradingLineId, isListed, notices }];
	});
}

function resolvePublicationWindow(requestedThroughSession: string): PublicationWindow {
	const publishedFrom = Temporal.PlainDate.from(requestedThroughSession)
		.subtract({ days: WATCHED_CALENDAR_DAYS - 1 })
		.toString();
	return { publishedFrom, publishedThrough: requestedThroughSession };
}

function checkIfTitleAnnouncesEvent(
	fact: RelevantFact,
	eventPatterns: readonly RegExp[],
	rules: WatchRules,
): boolean {
	const normalizedTitle = fact.title.trim().toLowerCase();
	// CEDEAR cash distributions are the feed's largest category; a broader phrase must never let
	// them in.
	const isExcluded = rules.excludedTitlePrefixes.some((prefix) =>
		normalizedTitle.startsWith(prefix.toLowerCase()),
	);

	if (isExcluded) {
		return false;
	}

	return eventPatterns.some((pattern) => pattern.test(fact.title));
}

/**
 * Matches a phrase only as whole words, so `ratio` could never match "CORPORATION". A run of
 * whitespace in the title matches one space.
 */
function createWholeWordsPattern(phrase: string): RegExp {
	const escapedWords = phrase.split(' ').map((word) => RegExp.escape(word));
	return new RegExp(`(?<![\\p{L}\\p{N}])${escapedWords.join('\\s+')}(?![\\p{L}\\p{N}])`, 'iu');
}

function checkIfFactConcernsLine(
	fact: RelevantFact,
	line: WatchedTradingLine,
	rules: WatchRules,
): boolean {
	const isFromProgramIssuer = checkIfFactIsFromProgramIssuer(fact, rules);

	if (line.instrumentType === 'cedear') {
		return isFromProgramIssuer && checkIfTitleNamesCedear(fact.title, line.symbol, rules);
	}

	// Banco Macro publishes CEDEAR notices under `BMA`, which is also its own stock's symbol.
	const isCedearProgramNotice = isFromProgramIssuer && CEDEAR_TITLE_PATTERN.test(fact.title);
	const issuerCode = rules.stockIssuerCodes[line.symbol] ?? line.symbol;

	return !isCedearProgramNotice && fact.especie.trim() === issuerCode;
}

function checkIfFactIsFromProgramIssuer(fact: RelevantFact, rules: WatchRules): boolean {
	const emisor = fact.emisor.trim().toLowerCase();
	return rules.cedearProgramIssuers.some((issuer) => issuer.toLowerCase() === emisor);
}

/**
 * The CEDEAR ticker is never in `especie`, which names the program issuer; it is one of the title's
 * pieces, or a company name used instead of it.
 */
function checkIfTitleNamesCedear(title: string, symbol: string, rules: WatchRules): boolean {
	const titlePieces = title.split(TITLE_SEPARATOR_PATTERN).map((piece) => piece.trim());

	return titlePieces.some((piece) => {
		const aliasedSymbol = rules.cedearNameAliases[piece];
		return piece === symbol || aliasedSymbol === symbol;
	});
}

function compareFactsByPublication(left: RelevantFact, right: RelevantFact): number {
	return left.publishedAt.localeCompare(right.publishedAt) || left.documentId - right.documentId;
}

function createNotice(fact: RelevantFact): CorporateActionNotice {
	return {
		documentId: fact.documentId,
		publishedAt: fact.publishedAt,
		title: fact.title,
		pdfUrl: buildDocumentDownloadUrl(fact.documentId),
	};
}

function checkIfActionIsNear(
	action: CorporateAction,
	notices: readonly CorporateActionNotice[],
): boolean {
	const exDate = Temporal.PlainDate.from(action.exDate);

	return notices.some((notice) => {
		const publicationDate = Temporal.PlainDate.from(notice.publishedAt.slice(0, 10));
		const distanceDays = Math.abs(publicationDate.until(exDate).days);
		return distanceDays <= LISTED_EX_DATE_DISTANCE_DAYS;
	});
}
