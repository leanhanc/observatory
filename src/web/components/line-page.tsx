import { formatLongDate } from '#web/lib/utils/es-ar-formatting/index.ts';
import { describeLineIdentity } from '#web/lib/utils/line-identity/index.ts';
import {
	CURRENCY_NOTES,
	describeLatestClose,
	selectDisplayCurrencies,
} from '#web/lib/utils/line-wording/index.ts';

import { AvailableLineDetails } from './available-line-details.tsx';
import { CurrencyControl } from './currency-control.tsx';
import { CurrencyVariants } from './currency-variants.tsx';
import { PhraseText } from './phrase-text.tsx';
import { UnavailableLineDetails } from './unavailable-line-details.tsx';

import type { LinePageProps } from '#web/lib/utils/snapshot-pages/index.ts';

export function LinePage({ requestedThroughSession, line }: LinePageProps) {
	const { ticker, typeLabel, underlying, isPesoLine } = describeLineIdentity(line);
	// An available line describes its own last session, which may precede the requested one when it
	// did not trade; an unavailable line has no data, so it says which session it was checked for.
	const sessionText =
		line.status === 'available'
			? `Datos al cierre del ${formatLongDate(line.latestState.sessionDate)}`
			: `Revisada al cierre del ${formatLongDate(requestedThroughSession)}`;
	// An unavailable line shows no prices, so it has no currency views or note.
	const currencies = line.status === 'available' ? selectDisplayCurrencies(line, isPesoLine) : [];
	const hasCurrencyNote = currencies.length > 1;
	const hasAboutDetails = underlying !== null || hasCurrencyNote;

	return (
		<main>
			<p>
				<a href="/">Ver todas</a>
			</p>
			<header>
				<h1>{ticker}</h1>
				{typeLabel !== null && <p>{typeLabel}</p>}
				<p>{sessionText}</p>
				{line.status === 'available' && (
					<p>
						<CurrencyVariants
							currencies={currencies}
							render={(currency) => (
								<PhraseText phrase={describeLatestClose(line, currency)} />
							)}
						/>
					</p>
				)}
				<CurrencyControl currencies={currencies} />
				{hasAboutDetails && (
					<details open>
						<summary>Sobre esta especie</summary>
						{underlying !== null && <p>Subyacente: {underlying}</p>}
						{hasCurrencyNote && (
							<p>
								<CurrencyVariants
									currencies={currencies}
									render={(currency) => CURRENCY_NOTES[currency]}
								/>
							</p>
						)}
					</details>
				)}
			</header>
			{line.status === 'available' ? (
				<AvailableLineDetails line={line} currencies={currencies} />
			) : (
				<UnavailableLineDetails line={line} />
			)}
		</main>
	);
}
