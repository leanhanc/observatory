export function assertIndicatorPeriod(period: number): void {
	if (!Number.isInteger(period) || period <= 0) {
		throw new TypeError('Indicator periods must be positive integers');
	}
}
