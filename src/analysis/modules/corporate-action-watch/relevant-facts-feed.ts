import * as v from 'valibot';

import {
	convertPublicationTimestamp,
	relevantFactsResponseSchema,
} from './corporate-action-watch.schema.ts';

import type { RelevantFact, RelevantFactsFetch } from './corporate-action-watch.types.ts';

const OPEN_BYMADATA_URL = 'https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free';
export const RELEVANT_FACTS_URL = `${OPEN_BYMADATA_URL}/bnown/relevant-facts`;
const DOCUMENT_DOWNLOAD_URL = `${OPEN_BYMADATA_URL}/sba/download`;
// Without it the feed pages at 250 rows, fewer than a week can hold.
const PAGE_SIZE = 5_000;

export type PublicationWindow = Readonly<{ publishedFrom: string; publishedThrough: string }>;

export type RelevantFactsResult =
	| Readonly<{ ok: true; facts: readonly RelevantFact[] }>
	| Readonly<{ ok: false; message: string }>;

/**
 * Fetches every relevant-facts row published within the window, both dates inclusive. Every
 * failure, including a paginated or incomplete answer, is returned rather than thrown.
 */
export async function fetchRelevantFacts(
	fetchFromProvider: RelevantFactsFetch,
	window: PublicationWindow,
): Promise<RelevantFactsResult> {
	let response: Response;

	try {
		response = await fetchFromProvider(RELEVANT_FACTS_URL, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: buildRequestBody(window),
		});
	} catch {
		return { ok: false, message: 'The relevant-facts feed could not be reached.' };
	}

	if (!response.ok) {
		return {
			ok: false,
			message: `The relevant-facts feed returned HTTP ${response.status}.`,
		};
	}

	let body: unknown;

	try {
		body = await response.json();
	} catch (error) {
		const message =
			error instanceof SyntaxError
				? 'The relevant-facts feed returned a body that is not JSON.'
				: 'The relevant-facts feed could not be read.';
		return { ok: false, message };
	}

	return parseRelevantFacts(body);
}

export function buildDocumentDownloadUrl(documentId: number): string {
	return `${DOCUMENT_DOWNLOAD_URL}/${documentId}`;
}

/** The web app's body, whose filters come from a server-configured pane, plus a page size. */
function buildRequestBody(window: PublicationWindow): string {
	return JSON.stringify({
		publishDate: window.publishedFrom,
		publishToDate: window.publishedThrough,
		textFilter: null,
		filter: true,
		dateEntryFrom: null,
		dateEntryTo: null,
		page_size: PAGE_SIZE,
	});
}

function parseRelevantFacts(body: unknown): RelevantFactsResult {
	const parse = v.safeParse(relevantFactsResponseSchema, body);

	if (!parse.success) {
		return {
			ok: false,
			message: 'The relevant-facts feed response does not have the expected shape.',
		};
	}

	const { content, data } = parse.output;
	// A paginated or truncated answer would silently hide notices.
	const isComplete = data.length === content.total_elements_count;

	if (!isComplete) {
		return {
			ok: false,
			message: `The relevant-facts feed returned ${data.length} of ${content.total_elements_count} rows.`,
		};
	}

	const facts = data.map((row) => ({
		especie: row.especie,
		publishedAt: convertPublicationTimestamp(row.fecha),
		documentId: row.descarga,
		title: row.referencia,
		emisor: row.emisor,
	}));

	return { ok: true, facts };
}
