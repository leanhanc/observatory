import { styleText } from 'node:util';

const BACKGROUND_COLORS = [
	'bgBlue',
	'bgGreen',
	'bgYellow',
	'bgMagenta',
	'bgCyan',
	'bgRed',
] as const;

function hashString(value: string): number {
	let hash = 0;

	for (let index = 0; index < value.length; index++) {
		hash = value.charCodeAt(index) + ((hash << 4) - hash);
	}

	return Math.abs(hash);
}

export function colorLoggerName(name: string): string {
	const colorIndex = hashString(name) % BACKGROUND_COLORS.length;
	const backgroundColor = BACKGROUND_COLORS[colorIndex] ?? 'bgBlue';

	return styleText([backgroundColor, 'white', 'bold'], ` ${name} `);
}

export function colorLogLevel(level: string): string {
	const normalizedLevel = level.toLowerCase();
	const displayedLevel = level.toUpperCase();

	if (normalizedLevel === 'error') {
		return styleText('red', displayedLevel);
	}

	if (normalizedLevel === 'warn') {
		return styleText('yellow', displayedLevel);
	}

	if (normalizedLevel === 'info') {
		return styleText('green', displayedLevel);
	}

	return displayedLevel;
}
