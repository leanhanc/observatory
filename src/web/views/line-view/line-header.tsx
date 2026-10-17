import { CurrencyVariants } from '#web/components/currency-variants.tsx';
import { formatLongDate } from '#web/lib/utils/es-ar-formatting/index.ts';
import { describeLatestCloseParts } from '#web/lib/utils/line-wording/index.ts';

import type { LineIdentity } from '#web/lib/utils/line-identity/index.ts';
import type { DisplayCurrency } from '#web/lib/utils/line-wording/index.ts';
import type { SnapshotLine } from '#web/lib/utils/snapshot-pages/index.ts';

type LineHeaderProps = Readonly<{
	identity: LineIdentity;
	line: SnapshotLine;
	requestedThroughSession: string;
	currencies: readonly DisplayCurrency[];
}>;

/**
 * Who the line is and where it closed: the ticker, its type with a CEDEAR's Underlying, the session
 * the page describes and, on an available line, the last close with its day change.
 */
export function LineHeader({
	identity,
	line,
	requestedThroughSession,
	currencies,
}: LineHeaderProps) {
	const { ticker, typeLabel, underlying } = identity;
	const typeParts = [typeLabel, underlying === null ? null : `Subyacente: ${underlying}`];
	const typeLine = typeParts.filter((part) => part !== null).join(' · ');
	// An available line describes its own last session, which may precede the requested one when it
	// did not trade; an unavailable line has no data, so it says which session it was checked for.
	const sessionText =
		line.status === 'available'
			? `Datos al cierre del ${formatLongDate(line.latestState.sessionDate)}`
			: `Revisada al cierre del ${formatLongDate(requestedThroughSession)}`;

	return (
		<header className="line-header">
			<p className="back-link">
				<a href="/">Ver todas</a>
			</p>
			<h1>{ticker}</h1>
			{typeLine !== '' && <p className="line-type">{typeLine}</p>}
			<p className="line-session">{sessionText}</p>
			{line.status === 'available' && (
				<p className="line-close figure">
					<CurrencyVariants
						currencies={currencies}
						render={(currency) => <LatestClose line={line} currency={currency} />}
					/>
				</p>
			)}
		</header>
	);
}

function LatestClose({
	line,
	currency,
}: {
	line: Extract<SnapshotLine, { status: 'available' }>;
	currency: DisplayCurrency;
}) {
	const { closeText, changeText, direction } = describeLatestCloseParts(line, currency);

	return (
		<>
			<strong className="line-close-price">{closeText}</strong>
			{changeText !== null && (
				<span className="line-close-change" data-direction={direction ?? undefined}>
					{` ${changeText}`}
				</span>
			)}
		</>
	);
}
