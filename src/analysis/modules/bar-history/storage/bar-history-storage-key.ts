export function buildBarHistoryStorageKey(tradingLineId: string): string {
	return `${tradingLineId}/v1/history.json`;
}
