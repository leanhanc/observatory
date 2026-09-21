import type { DailyBar } from '#modules/bar-history/index.ts';

export async function loadNflxFixture(): Promise<readonly DailyBar[]> {
	const fixture = Bun.file(new URL('../fixtures/nflx-501.csv', import.meta.url));
	const csv = await fixture.text();
	const [, ...rows] = csv.trim().split('\n');

	return rows.map((row) => {
		const [sessionDate, open, high, low, close, volume] = row.split(',');

		return {
			sessionDate: sessionDate!,
			open: Number(open),
			high: Number(high),
			low: Number(low),
			close: Number(close),
			volume: Number(volume),
		};
	});
}

export function buildBars(closes: readonly number[]): readonly DailyBar[] {
	return closes.map((close, index) => ({
		sessionDate: `2026-01-${String(index + 1).padStart(2, '0')}`,
		open: close,
		high: close + 2,
		low: close - 1,
		close,
		volume: 1,
	}));
}
