import { validateWatchRules } from './corporate-action-watch.ts';
import storedWatchRules from './data/corporate-action-watch-rules.v1.json' with { type: 'json' };

export {
	findCorporateActionCandidates,
	validateWatchRules,
	watchCorporateActions,
} from './corporate-action-watch.ts';
export { RELEVANT_FACTS_URL } from './relevant-facts-feed.ts';

const rulesValidation = validateWatchRules(storedWatchRules);

if (!rulesValidation.isValid) {
	throw new Error('The stored corporate-action watch rules are invalid.', {
		cause: rulesValidation.issues,
	});
}

/** The committed publisher names, aliases and event phrases the watch matches notices with. */
export const watchRules = rulesValidation.rules;

export type {
	CorporateActionCandidate,
	CorporateActionNotice,
	CorporateActionWatch,
	RelevantFact,
	RelevantFactsFetch,
	WatchRules,
	WatchedTradingLine,
} from './corporate-action-watch.types.ts';
