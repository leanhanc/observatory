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
// A notice is listed when an entry for its line has an ex-date in this range around its publication.
// Announcements and their follow-ups can come up to about two months before the ex-date; a late
// notice can come days after it.
const LISTED_EX_DATE_DAYS_BEFORE_NOTICE = 10;
const LISTED_EX_DATE_DAYS_AFTER_NOTICE = 70;
// Publishers separate a title's ticker, name and event with " - ", a colon or parentheses.
const TITLE_SEPARATOR_PATTERN = / - |:|\(|\)/;
const CEDEAR_TITLE_PATTERN = /cedear/i;

type MatchContext = Readonly<{
	rules: WatchRules;
	eventPatterns: readonly RegExp[];
	/** The analyzed CEDEAR symbols and the title names aliased to them. */
	cedearTitleNames: ReadonlySet<string>;
}>;

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
 * Rules that name a line the run does not analyze would never match, and two stocks sharing an
 * issuer code would report every notice twice, so both are rejected before the run starts.
 *
 * @throws {Error} when a stock issuer code is keyed by a symbol that is not an analyzed stock, an
 * alias targets a symbol that is not an analyzed CEDEAR, or two stocks share an issuer code.
 */
export function assertWatchRulesMatchTradingLines(
	rules: WatchRules,
	tradingLines: readonly WatchedTradingLine[],
): void {
	const stockSymbols = new Set(selectSymbols(tradingLines, 'stock'));
	const cedearSymbols = new Set(selectSymbols(tradingLines, 'cedear'));
	const strayStockSymbols = Object.keys(rules.stockIssuerCodes).filter(
		(symbol) => !stockSymbols.has(symbol),
	);
	const strayAliasTargets = Object.values(rules.cedearNameAliases).filter(
		(symbol) => !cedearSymbols.has(symbol),
	);
	const issuerCodes = [...stockSymbols].map((symbol) => resolveIssuerCode(symbol, rules));
	const sharedIssuerCodes = issuerCodes.filter(
		(code, index) => issuerCodes.indexOf(code) !== index,
	);
	const problems = [
		...strayStockSymbols.map((symbol) => `issuer code for non-analyzed stock ${symbol}`),
		...strayAliasTargets.map((symbol) => `alias for non-analyzed CEDEAR ${symbol}`),
		...sharedIssuerCodes.map((code) => `issuer code ${code} shared by two stocks`),
	];

	if (problems.length > 0) {
		throw new Error(
			`The corporate-action watch rules do not fit the analyzed lines: ${problems.join('; ')}.`,
		);
	}
}

/**
 * Fetches the week of relevant facts ending on the Requested-Through Session and finds the
 * Corporate Action Notices for the given lines. Any failure, of the feed or unexpected, is returned
 * as an unavailable watch, never thrown, so the watch can never discard a finished run. Notice
 * documents are never downloaded.
 */
export async function watchCorporateActions(
	request: WatchCorporateActionsRequest,
): Promise<CorporateActionWatch> {
	const { fetchFromProvider, requestedThroughSession, tradingLines, corporateActions, rules } =
		request;
	const window = resolvePublicationWindow(requestedThroughSession);

	try {
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
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		return { status: 'unavailable', ...window, message: `The watch failed: ${reason}` };
	}
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
	const context = createMatchContext(tradingLines, rules);
	const eventFacts = facts.filter((fact) => checkIfTitleAnnouncesEvent(fact, context));

	return tradingLines.flatMap((line) => {
		const lineFacts = eventFacts.filter((fact) => checkIfFactConcernsLine(fact, line, context));

		if (lineFacts.length === 0) {
			return [];
		}

		const lineActions = corporateActions.filter(
			(action) => action.tradingLineId === line.tradingLineId,
		);
		const notices = lineFacts
			.toSorted(compareFactsByPublication)
			.map((fact) => createNotice(fact, lineActions));

		return [{ tradingLineId: line.tradingLineId, notices }];
	});
}

function createMatchContext(
	tradingLines: readonly WatchedTradingLine[],
	rules: WatchRules,
): MatchContext {
	const cedearSymbols = new Set(selectSymbols(tradingLines, 'cedear'));
	const aliasedNames = Object.entries(rules.cedearNameAliases).flatMap(([name, symbol]) =>
		cedearSymbols.has(symbol) ? [name] : [],
	);

	return {
		rules,
		eventPatterns: rules.eventPhrases.map(createWholeWordsPattern),
		cedearTitleNames: new Set([...cedearSymbols, ...aliasedNames]),
	};
}

function selectSymbols(
	tradingLines: readonly WatchedTradingLine[],
	instrumentType: WatchedTradingLine['instrumentType'],
): readonly string[] {
	return tradingLines
		.filter((line) => line.instrumentType === instrumentType)
		.map((line) => line.symbol);
}

function resolveIssuerCode(symbol: string, rules: WatchRules): string {
	return rules.stockIssuerCodes[symbol] ?? symbol;
}

function resolvePublicationWindow(requestedThroughSession: string): PublicationWindow {
	const publishedFrom = Temporal.PlainDate.from(requestedThroughSession)
		.subtract({ days: WATCHED_CALENDAR_DAYS - 1 })
		.toString();
	return { publishedFrom, publishedThrough: requestedThroughSession };
}

function checkIfTitleAnnouncesEvent(fact: RelevantFact, context: MatchContext): boolean {
	const { rules, eventPatterns } = context;
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
	context: MatchContext,
): boolean {
	const { rules, cedearTitleNames } = context;
	const isFromProgramIssuer = checkIfFactIsFromProgramIssuer(fact, rules);
	const titlePieces = splitTitle(fact.title);

	if (line.instrumentType === 'cedear') {
		return isFromProgramIssuer && checkIfTitleNamesCedear(titlePieces, line.symbol, rules);
	}

	// Banco Macro publishes CEDEAR notices under `BMA`, which is also its own stock's symbol. A
	// program issuer's notice is about a CEDEAR when its title says so or names an analyzed one.
	const isCedearProgramNotice =
		isFromProgramIssuer &&
		(CEDEAR_TITLE_PATTERN.test(fact.title) ||
			titlePieces.some((piece) => cedearTitleNames.has(piece)));
	const issuerCode = resolveIssuerCode(line.symbol, rules);

	return !isCedearProgramNotice && fact.especie.trim() === issuerCode;
}

function splitTitle(title: string): readonly string[] {
	return title.split(TITLE_SEPARATOR_PATTERN).map((piece) => piece.trim());
}

function checkIfFactIsFromProgramIssuer(fact: RelevantFact, rules: WatchRules): boolean {
	const emisor = fact.emisor.trim().toLowerCase();
	return rules.cedearProgramIssuers.some((issuer) => issuer.toLowerCase() === emisor);
}

/**
 * The CEDEAR ticker is never in `especie`, which names the program issuer; it is one of the title's
 * pieces, or a company name used instead of it.
 */
function checkIfTitleNamesCedear(
	titlePieces: readonly string[],
	symbol: string,
	rules: WatchRules,
): boolean {
	return titlePieces.some((piece) => {
		const aliasedSymbol = rules.cedearNameAliases[piece];
		return piece === symbol || aliasedSymbol === symbol;
	});
}

function compareFactsByPublication(left: RelevantFact, right: RelevantFact): number {
	return left.publishedAt.localeCompare(right.publishedAt) || left.documentId - right.documentId;
}

/** Each notice is listed on its own, so a listed event never hides another in the same window. */
function createNotice(
	fact: RelevantFact,
	lineActions: readonly CorporateAction[],
): CorporateActionNotice {
	const publicationDate = Temporal.PlainDate.from(fact.publishedAt.slice(0, 10));
	const isListed = lineActions.some((action) => {
		const daysFromNoticeToExDate = publicationDate.until(action.exDate).days;
		return (
			daysFromNoticeToExDate >= -LISTED_EX_DATE_DAYS_BEFORE_NOTICE &&
			daysFromNoticeToExDate <= LISTED_EX_DATE_DAYS_AFTER_NOTICE
		);
	});

	return {
		documentId: fact.documentId,
		publishedAt: fact.publishedAt,
		title: fact.title,
		pdfUrl: buildDocumentDownloadUrl(fact.documentId),
		isListed,
	};
}
