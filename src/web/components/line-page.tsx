import { formatLongDate } from '#web/lib/utils/es-ar-formatting/index.ts';
import { describeLineIdentity } from '#web/lib/utils/line-identity/index.ts';
import { CURRENCY_NOTE } from '#web/lib/utils/line-wording/index.ts';

import { AvailableLineDetails } from './available-line-details.tsx';
import { UnavailableLineDetails } from './unavailable-line-details.tsx';

import type { LinePageProps } from '#web/lib/utils/snapshot-pages/index.ts';

export function LinePage({ requestedThroughSession, priceUnit, line }: LinePageProps) {
	const { ticker, typeLabel, underlying, isPesoLine } = describeLineIdentity(line);
	// An available line describes its own last session, which may precede the requested one when it
	// did not trade; an unavailable line has no data, so it says which session it was checked for.
	const sessionText =
		line.status === 'available'
			? `Datos al cierre del ${formatLongDate(line.latestState.sessionDate)}`
			: `Revisada al cierre del ${formatLongDate(requestedThroughSession)}`;
	// The currency note explains peso equivalents, which only an available line shows.
	const hasCurrencyNote = line.status === 'available' && isPesoLine;
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
				{hasAboutDetails && (
					<details open>
						<summary>Sobre esta especie</summary>
						{underlying !== null && <p>Subyacente: {underlying}</p>}
						{hasCurrencyNote && <p>{CURRENCY_NOTE}</p>}
					</details>
				)}
			</header>
			{line.status === 'available' ? (
				<AvailableLineDetails line={line} context={{ priceUnit, isPesoLine }} />
			) : (
				<UnavailableLineDetails line={line} />
			)}
		</main>
	);
}
