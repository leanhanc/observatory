import { validateCorporateActionList } from './corporate-actions.ts';
import storedCorporateActionList from './data/corporate-actions.v1.json' with { type: 'json' };

export { applyCorporateActions, validateCorporateActionList } from './corporate-actions.ts';

const listValidation = validateCorporateActionList(storedCorporateActionList);

if (!listValidation.isValid) {
	throw new Error('The stored Corporate Action list is invalid.', {
		cause: listValidation.issues,
	});
}

/** The committed, confirmed Corporate Actions the provider was observed not to adjust. */
export const corporateActions = listValidation.corporateActions;

export type {
	CorporateAction,
	CorporateActionCorrection,
	CorporateActionOutcome,
	CorporateActionStatus,
	CorporateActionValidationIssue,
} from './corporate-actions.types.ts';
