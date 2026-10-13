import { describe, expect, test } from 'bun:test';

import { renderToStaticMarkup } from 'react-dom/server';

import { LinePage } from './line-page.tsx';

import type { UnavailableLine } from '#web/lib/utils/snapshot-pages/index.ts';

describe('LinePage', () => {
	test('an unavailable peso line shows no currency note, since it shows no prices', () => {
		const line: UnavailableLine = {
			status: 'unavailable',
			instrumentId: 'galicia-stock',
			tradingLineId: 'galicia-stock-byma-ars',
			reason: 'no-provider-bars',
			message: 'The provider returned no Daily Bars for this Trading Line.',
		};

		const html = renderToStaticMarkup(
			<LinePage requestedThroughSession="2026-10-09" priceUnit="mep-dollar" line={line} />,
		);

		expect(html).toContain('Revisada al cierre del viernes 9 de octubre de 2026');
		expect(html).not.toContain('Precios analizados en dólares MEP');
		expect(html).not.toContain('<details');
	});
});
