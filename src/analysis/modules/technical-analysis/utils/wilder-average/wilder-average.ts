export function calculateWilderAverage(
	previousAverage: number,
	currentValue: number,
	smoothingPeriod: number,
): number {
	const retainedAverage = previousAverage * (smoothingPeriod - 1);

	return (retainedAverage + currentValue) / smoothingPeriod;
}
