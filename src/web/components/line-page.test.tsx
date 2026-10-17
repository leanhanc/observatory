import { describe, expect, test } from 'bun:test';

import { renderToStaticMarkup } from 'react-dom/server';

import { LinePage } from './line-page.tsx';

import type { AvailableLine, UnavailableLine } from '#web/lib/utils/snapshot-pages/index.ts';

// GGAL on 13 Oct 2026, with a Structure Break whose session had no CCL Rate and a Regime
// Transition, which names no price.
const ggalLine: AvailableLine = {
	status: 'available',
	instrumentId: 'galicia-stock',
	tradingLineId: 'galicia-stock-byma-ars',
	latestState: {
		sessionDate: '2026-10-13',
		regime: 'bearish',
		pendingRegimeTransition: null,
		regimeTippingCloses: {
			bullish: { closeAbove: 4.761, isFastEmaAligned: false },
			bearish: { closeBelow: 4.6114, isFastEmaAligned: true },
		},
		structure: 'downtrend',
		lastConfirmedSwingHigh: {
			kind: 'high',
			price: 4.0425,
			occurredAtSession: '2026-10-06',
			confirmedAtSession: '2026-10-09',
			priceRelativeToSwingInPercent: -4.6,
			closePosition: 'at-or-below',
		},
		lastConfirmedSwingLow: {
			kind: 'low',
			price: 3.6781,
			occurredAtSession: '2026-10-01',
			confirmedAtSession: '2026-10-06',
			priceRelativeToSwingInPercent: 4.9,
			closePosition: 'at-or-above',
		},
		rsi: 34,
		priceRelativeToEmaInAtr: -1.3,
		priceRelativeToLongTermEmaInPercent: -17.7,
		situations: [],
	},
	latestClose: {
		sessionDate: '2026-10-13',
		previousSessionDate: '2026-10-10',
		peso: { close: 5940, previousClose: 5880, change: 60, percentChange: 1.0204 },
		mep: { close: 3.8573, previousClose: 3.8197, change: 0.0376, percentChange: 0.9844 },
		ccl: { close: 3.684, previousClose: 3.6944, change: -0.0104, percentChange: -0.2815 },
	},
	periodReturns: [
		{ windowMonths: 1, fromSessionDate: '2026-09-11', percentChange: -15.2 },
		{ windowMonths: 3, fromSessionDate: '2026-07-13', percentChange: -27.3 },
		{ windowMonths: 12, fromSessionDate: '2025-10-13', percentChange: 14.3 },
	],
	pesoPeriodReturns: [
		{ windowMonths: 1, fromSessionDate: '2026-09-11', percentChange: -15.1 },
		{ windowMonths: 3, fromSessionDate: '2026-07-13', percentChange: -26.3 },
		{ windowMonths: 12, fromSessionDate: '2025-10-13', percentChange: 25.1 },
	],
	cclPeriodReturns: [
		{ windowMonths: 1, fromSessionDate: '2026-09-11', percentChange: -15.8 },
		{ windowMonths: 3, fromSessionDate: '2026-07-13', percentChange: -28.3 },
		{ windowMonths: 12, fromSessionDate: '2025-10-13', percentChange: 10.4 },
	],
	pesoEquivalents: {
		sessionDate: '2026-10-13',
		mepRate: 1539.94,
		close: 5940,
		lastConfirmedSwingHigh: 6225.2,
		lastConfirmedSwingLow: 5664.04,
		regimeTippingCloses: { bullishCloseAbove: 7331.64, bearishCloseBelow: 7101.27 },
	},
	cclEquivalents: {
		sessionDate: '2026-10-13',
		cclRate: 1612.38,
		close: 3.684,
		lastConfirmedSwingHigh: 3.8609,
		lastConfirmedSwingLow: 3.5129,
		regimeTippingCloses: { bullishCloseAbove: 4.5471, bearishCloseBelow: 4.4042 },
	},
	events: [
		{
			sessionDate: '2026-09-18',
			event: {
				type: 'structure-break',
				direction: 'upward',
				priorStructure: 'downtrend',
				definingSwing: {
					kind: 'high',
					price: 4.3,
					occurredAtSession: '2026-09-01',
					confirmedAtSession: '2026-09-04',
				},
				closePrice: 4.35,
				pesoEquivalents: { mepRate: 1538, closePrice: 6690.3, definingSwingPrice: 6613.4 },
				cclEquivalents: null,
			},
			coincidesWithLargeMove: false,
		},
		{
			sessionDate: '2026-09-29',
			event: {
				type: 'regime-transition',
				from: 'bullish',
				to: 'bearish',
				confirmingSessionDates: ['2026-09-25', '2026-09-26', '2026-09-29'],
			},
			coincidesWithLargeMove: false,
		},
	],
};

describe('LinePage', () => {
	test('a peso line with CCL figures offers ARS, USD and CCL, with ARS checked', () => {
		const html = renderLinePage(ggalLine);
		const inputs = [...html.matchAll(/<input[^>]*>/g)].map(([input]) => input);

		expect(inputs).toHaveLength(3);
		expect(inputs.map((input) => input.match(/id="([^"]+)"/)?.[1])).toEqual([
			'currency-ars',
			'currency-usd',
			'currency-ccl',
		]);
		expect(inputs[0]).toContain('checked');
		expect(inputs.slice(1).some((input) => input.includes('checked'))).toBe(false);
		expect(html).toContain('<legend>Moneda</legend>');
		expect(html).not.toContain('<script');
	});

	test('the last close follows the data date in each view, before the control', async () => {
		const html = renderLinePage(ggalLine);
		const closeIndex = html.indexOf('5.940');

		expect(closeIndex).toBeGreaterThan(html.indexOf('Datos al cierre'));
		expect(closeIndex).toBeLessThan(html.indexOf('currency-control'));
		expect(html).toContain('(+$\u00a060, +1,0\u00a0%)');
		expect((await selectVariants(html, 'ccl'))[0]).toBe(
			'U$S\u00a03,68 (−U$S\u00a00,01, −0,3\u00a0%)',
		);
		expect(html).not.toContain('Último cierre');
	});

	test('the control comes after the data date, near the top', () => {
		const html = renderLinePage(ggalLine);

		expect(html.indexOf('currency-control')).toBeGreaterThan(html.indexOf('Datos al cierre'));
		expect(html.indexOf('currency-control')).toBeLessThan(html.indexOf('Qué está haciendo'));
	});

	test('each view names no other currency’s price', async () => {
		const html = renderLinePage(ggalLine);
		const pesoVariants = await selectVariants(html, 'ars');
		const dollarVariants = [
			...(await selectVariants(html, 'usd')),
			...(await selectVariants(html, 'ccl')),
		];
		const pesoAmount = /(?<!U)\$\s\d/;

		expect(pesoVariants.length).toBeGreaterThan(0);
		expect(pesoVariants.some((variant) => variant.includes('U$S'))).toBe(false);
		expect(pesoVariants.some((variant) => pesoAmount.test(variant))).toBe(true);
		expect(dollarVariants.some((variant) => pesoAmount.test(variant))).toBe(false);
		expect(html).not.toMatch(/(?<!U)\$\s[\d.,]+\s\(US\$/);
	});

	test('every view writes every phrase that names a price', async () => {
		const html = renderLinePage(ggalLine);
		const pesoVariants = await selectVariants(html, 'ars');
		const mepVariants = await selectVariants(html, 'usd');
		const cclVariants = await selectVariants(html, 'ccl');
		const variantCounts = [pesoVariants, mepVariants, cclVariants].map(
			(variants) => variants.length,
		);

		// The last close, the currency note, returns, levels, pattern, tipping points and raw
		// evidence, and the Structure Break twice: in the last month's changes and in the history.
		expect(variantCounts).toEqual([9, 9, 9]);
		expect(cclVariants.join(' ')).toContain('Sin cotización CCL ese día.');
		expect(cclVariants.join(' ')).toContain('Precios en dólares CCL');
	});

	test('phrases without a price are rendered once', () => {
		const html = renderLinePage(ggalLine);

		expect(countOccurrences(html, 'Tendencia bajista.')).toBe(1);
		expect(countOccurrences(html, 'Momentum: 34 sobre 100.')).toBe(1);
		expect(countOccurrences(html, 'Tendencia: alcista → bajista.')).toBe(2);
	});

	test('a line without CCL figures offers no CCL view', () => {
		const html = renderLinePage({ ...ggalLine, cclEquivalents: null });

		expect(html).toContain('id="currency-ars"');
		expect(html).toContain('id="currency-usd"');
		expect(html).not.toContain('currency-ccl');
		expect(html).not.toContain('data-currency-view="ccl"');
		expect(html).not.toContain('CCL');
	});

	test('a line the Catalog does not list as ARS shows MEP dollars with no control', () => {
		const html = renderLinePage({ ...ggalLine, tradingLineId: 'unlisted-stock-byma-ars' });

		expect(html).not.toContain('<input');
		expect(html).not.toContain('data-currency-view');
		expect(html).toContain('Soporte</strong> en <strong>U$S');
		expect(html).not.toMatch(/(?<!U)\$\s\d/);
	});

	test('an unavailable peso line shows no currency note or control, since it shows no prices', () => {
		const line: UnavailableLine = {
			status: 'unavailable',
			instrumentId: 'galicia-stock',
			tradingLineId: 'galicia-stock-byma-ars',
			reason: 'no-provider-bars',
			message: 'The provider returned no Daily Bars for this Trading Line.',
		};

		const html = renderLinePage(line);

		expect(html).toContain('Revisada al cierre del viernes 9 de octubre de 2026');
		expect(html).not.toContain('Precios en');
		expect(html).not.toContain('<input');
		expect(html).not.toContain('<details');
	});
});

function renderLinePage(line: AvailableLine | UnavailableLine): string {
	return renderToStaticMarkup(<LinePage requestedThroughSession="2026-10-09" line={line} />);
}

type Currency = 'ars' | 'usd' | 'ccl';

/** The text of each element marked with the view; variants are never nested in one another. */
async function selectVariants(html: string, currency: Currency): Promise<readonly string[]> {
	const variants: string[] = [];
	let openVariant: string[] | null = null;
	const rewriter = new HTMLRewriter()
		.on(`[data-currency-view="${currency}"]`, {
			element(element) {
				openVariant = [];
				element.onEndTag(() => {
					variants.push(openVariant!.join(''));
					openVariant = null;
				});
			},
		})
		.on('*', {
			text(text) {
				openVariant?.push(text.text);
			},
		});

	await rewriter.transform(new Response(html)).text();
	return variants;
}

function countOccurrences(text: string, fragment: string): number {
	return text.split(fragment).length - 1;
}
