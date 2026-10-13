import { describe, expect, test } from 'bun:test';

import { describeLineIdentity } from './line-identity.ts';

describe('describeLineIdentity', () => {
	test('an Argentine stock traded in pesos', () => {
		expect(
			describeLineIdentity({
				instrumentId: 'galicia-stock',
				tradingLineId: 'galicia-stock-byma-ars',
			}),
		).toEqual({
			ticker: 'GGAL',
			typeLabel: 'Acción argentina',
			underlying: null,
			isPesoLine: true,
		});
	});

	test('a CEDEAR names its Underlying', () => {
		expect(
			describeLineIdentity({
				instrumentId: 'apple-cedear',
				tradingLineId: 'apple-cedear-byma-ars',
			}),
		).toEqual({
			ticker: 'AAPL',
			typeLabel: 'CEDEAR',
			underlying: 'AAPL · NASDAQ',
			isPesoLine: true,
		});
	});

	test('a line quoted in dollars is not a peso line', () => {
		expect(
			describeLineIdentity({
				instrumentId: 'al30-bond',
				tradingLineId: 'al30-bond-byma-usd-mep',
			}),
		).toEqual({ ticker: 'AL30D', typeLabel: null, underlying: null, isPesoLine: false });
	});

	test('a line the Catalog no longer lists keeps its ID and claims no currency', () => {
		expect(
			describeLineIdentity({ instrumentId: 'gone', tradingLineId: 'gone-stock-byma-ars' }),
		).toEqual({
			ticker: 'gone-stock-byma-ars',
			typeLabel: null,
			underlying: null,
			isPesoLine: false,
		});
	});
});
