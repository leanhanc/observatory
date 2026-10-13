import {
	formatEvaluatedPercent,
	formatEvaluatedValue,
	formatPendingRegimeTransition,
	formatPeriodReturn,
	formatPesoSwingLevel,
	formatPesos,
	formatResistance,
	formatSituation,
	formatSupport,
	formatSwingLevel,
	formatTippingClose,
} from '#web/lib/utils/line-formatting/index.ts';

import { EventDetails } from './event-details.tsx';

import type { AvailableLine, SnapshotPriceUnit } from '#web/lib/utils/snapshot-pages/index.ts';

type AvailableLineDetailsProps = { line: AvailableLine; priceUnit: SnapshotPriceUnit };

export function AvailableLineDetails({ line, priceUnit }: AvailableLineDetailsProps) {
	const {
		sessionDate,
		regime,
		pendingRegimeTransition,
		regimeTippingCloses,
		structure,
		lastConfirmedSwingHigh,
		lastConfirmedSwingLow,
		rsi,
		priceRelativeToEmaInAtr,
		priceRelativeToLongTermEmaInPercent,
		situations,
	} = line.latestState;
	const { pesoEquivalents, periodReturns } = line;
	const pesoTippingCloses = pesoEquivalents.regimeTippingCloses;
	const hasEvents = line.events.length > 0;
	const hasSituations = situations.length > 0;
	const hasTippingCloses = regimeTippingCloses !== null && pesoTippingCloses !== null;

	return (
		<>
			<h2>Change of the close in MEP dollars, as of {sessionDate}</h2>
			<ul>
				{periodReturns.map((periodReturn) => (
					<li key={periodReturn.windowMarketSessions}>
						{formatPeriodReturn(periodReturn)}
					</li>
				))}
			</ul>
			<h2>Situations</h2>
			{hasSituations ? (
				<ul>
					{situations.map((situation) => (
						<li key={situation.type}>
							{formatSituation(situation, line.latestState, priceUnit)}
						</li>
					))}
				</ul>
			) : (
				<p>None active.</p>
			)}
			<h2>Support and resistance</h2>
			<ul>
				<li>Last confirmed swing low: {formatSupport(lastConfirmedSwingLow)}</li>
				<li>Last confirmed swing high: {formatResistance(lastConfirmedSwingHigh)}</li>
			</ul>
			<h2>Regime tipping closes as of {sessionDate}</h2>
			{hasTippingCloses ? (
				<>
					<ul>
						<li>
							Bullish proposal needs{' '}
							{formatTippingClose(
								'bullish',
								regimeTippingCloses,
								{ ...pesoEquivalents, regimeTippingCloses: pesoTippingCloses },
								priceUnit,
							)}
						</li>
						<li>
							Bearish proposal needs{' '}
							{formatTippingClose(
								'bearish',
								regimeTippingCloses,
								{ ...pesoEquivalents, regimeTippingCloses: pesoTippingCloses },
								priceUnit,
							)}
						</li>
					</ul>
					<p>
						These are conditions of Observatory's Regime rule as of this session, not
						targets. Each later close moves the averages and the ATR, so later sessions
						have slightly different values, and a proposal changes Regime only after its
						confirming sessions.
					</p>
				</>
			) : (
				<p>Not evaluated.</p>
			)}
			<h2>State at the close of {sessionDate}</h2>
			<ul>
				<li>Regime: {formatEvaluatedValue(regime)}</li>
				<li>
					Pending Regime transition:{' '}
					{formatPendingRegimeTransition(pendingRegimeTransition)}
				</li>
				<li>Structure: {formatEvaluatedValue(structure)}</li>
				<li>
					Last confirmed swing high: {formatSwingLevel(lastConfirmedSwingHigh, priceUnit)}
				</li>
				<li>
					Last confirmed swing low: {formatSwingLevel(lastConfirmedSwingLow, priceUnit)}
				</li>
				<li>RSI: {formatEvaluatedValue(rsi)}</li>
				<li>
					Price relative to EMA, in ATRs: {formatEvaluatedValue(priceRelativeToEmaInAtr)}
				</li>
				<li>
					Price relative to the long-term EMA:{' '}
					{formatEvaluatedPercent(priceRelativeToLongTermEmaInPercent)}
				</li>
			</ul>
			<h3>In pesos</h3>
			<ul>
				<li>
					Close on {pesoEquivalents.sessionDate}: {formatPesos(pesoEquivalents.close)}
				</li>
				<li>
					Last confirmed swing high:{' '}
					{formatPesoSwingLevel(pesoEquivalents.lastConfirmedSwingHigh, pesoEquivalents)}
				</li>
				<li>
					Last confirmed swing low:{' '}
					{formatPesoSwingLevel(pesoEquivalents.lastConfirmedSwingLow, pesoEquivalents)}
				</li>
			</ul>
			<p>
				Swing levels are found on prices in MEP dollars. Their peso equivalents move with
				the MEP rate and are not prices at which the line turned in pesos.
			</p>
			<h2>Events</h2>
			{hasEvents ? (
				<ul>
					{line.events.map((snapshotEvent, index) => (
						<li
							key={`${snapshotEvent.sessionDate}-${snapshotEvent.event.type}-${index}`}
						>
							<EventDetails snapshotEvent={snapshotEvent} priceUnit={priceUnit} />
						</li>
					))}
				</ul>
			) : (
				<p>No Events.</p>
			)}
		</>
	);
}
