import type { CSSProperties, ReactNode } from 'react';

/** A label under the meter's track, at a position in percent of its width. */
export type MeterTag = Readonly<{ position: number; label: ReactNode }>;

type MeterProps = Readonly<{
	/** Shaded spans of the track, in percent, such as RSI's zones beyond 30 and 70. */
	zones?: readonly Readonly<{ from: number; to: number }>[];
	/** A bar from one position to another, in accent, such as the stretch from zero. */
	fill?: Readonly<{ from: number; to: number }>;
	ticks: readonly number[];
	/** Where the reading's needle sits, when the meter has one. */
	needle?: number;
	reading: Readonly<{ position: number; label: ReactNode }>;
	tags: readonly MeterTag[];
}>;

/**
 * A small fixed scale for one reading, such as RSI on 0–100 or the stretch on ±3 ATR. It repeats
 * its sentence, so assistive technology reads the sentence and skips the drawing.
 */
export function Meter({ zones = [], fill, ticks, needle, reading, tags }: MeterProps) {
	return (
		<div className="meter" aria-hidden="true">
			<div className="meter-track" />
			{zones.map((zone, index) => (
				<div key={index} className="meter-zone" style={toSpanStyle(zone)} />
			))}
			{fill && <div className="meter-fill" style={toSpanStyle(fill)} />}
			{ticks.map((tick) => (
				<div key={tick} className="meter-tick" style={toPositionStyle(tick)} />
			))}
			{needle !== undefined && (
				<div className="meter-needle" style={toPositionStyle(needle)} />
			)}
			<span className="meter-reading figure" style={toPositionStyle(reading.position)}>
				{reading.label}
			</span>
			{tags.map((tag, index) => (
				<span
					key={index}
					className="meter-tag figure"
					style={toPositionStyle(tag.position)}
				>
					{tag.label}
				</span>
			))}
		</div>
	);
}

function toPositionStyle(position: number): CSSProperties {
	return { '--position': `${position}%` } as CSSProperties;
}

function toSpanStyle({ from, to }: Readonly<{ from: number; to: number }>): CSSProperties {
	const left = Math.min(from, to);
	return { left: `${left}%`, width: `${Math.abs(to - from)}%` };
}
