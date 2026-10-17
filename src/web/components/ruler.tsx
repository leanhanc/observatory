import type { CSSProperties, ReactNode } from 'react';

/** A span of the ruler, in percent of its width. */
export type RulerSpan = Readonly<{ from: number; to: number }>;

/**
 * One mark on the ruler, at a position in percent of its width. Marks are listed by priority: when
 * two tags on the same row would overlap, the later one moves to the other row, or is left out when
 * that row has no room either. `close` is the needle with its
 * caret; `strong` is a tipping point in accent; `tick` is any other level.
 */
export type RulerMark = Readonly<{
	position: number;
	emphasis: 'close' | 'tick' | 'strong';
	above?: ReactNode;
	below?: ReactNode;
}>;

type RulerProps = Readonly<{
	marks: readonly RulerMark[];
	/** A shaded span between two levels, such as Regime's noise band. */
	band?: RulerSpan;
	/** A dotted line from the close to a level, the distance the sentence names. */
	gap?: RulerSpan;
}>;

// Tags near an end align to it so they stay inside the ruler.
const EDGE_ALIGNMENT_MARGIN = 12;
// Two tags on one row closer than this, in percent of the width, would overlap at phone width.
const MINIMUM_TAG_GAP = 22;

/**
 * A horizontal scale that reads as a ruler, not a control: a hairline track, thin ticks for the
 * levels and a needle with a caret for the close. It repeats what its sentence says, so assistive
 * technology reads the sentence and skips the drawing.
 */
export function Ruler({ marks, band, gap }: RulerProps) {
	return (
		<div className="ruler" aria-hidden="true">
			<div className="ruler-track" />
			{band && <div className="ruler-band" style={toSpanStyle(band)} />}
			{gap && <div className="ruler-gap" style={toSpanStyle(gap)} />}
			{keepSeparatedTags(marks).map((mark, index) => (
				<RulerMarkView key={index} mark={mark} />
			))}
		</div>
	);
}

function RulerMarkView({ mark }: { mark: RulerMark }) {
	const { position, emphasis, above, below } = mark;
	const positionStyle = { '--position': `${position}%` } as CSSProperties;
	const alignment = alignTag(position);

	return (
		<>
			<div className={`ruler-mark ruler-mark-${emphasis}`} style={positionStyle} />
			{above !== undefined && (
				<span
					className={`ruler-tag ruler-tag-above ruler-tag-${alignment}`}
					style={positionStyle}
				>
					{above}
				</span>
			)}
			{below !== undefined && (
				<span
					className={`ruler-tag ruler-tag-below ruler-tag-${alignment}`}
					style={positionStyle}
				>
					{below}
				</span>
			)}
		</>
	);
}

/**
 * Keeps each tag on its own row when it has room there, in priority order. A tag that does not fit
 * moves to the other row when that has room, so a level keeps its label where it can; only a tag
 * with room on neither row is left out.
 */
function keepSeparatedTags(marks: readonly RulerMark[]): readonly RulerMark[] {
	const takenPositions = { above: [] as number[], below: [] as number[] };
	const placedTags = marks.map((mark) => ({
		above: mark.above !== undefined && claimTagRoom(takenPositions.above, mark.position),
		below: mark.below !== undefined && claimTagRoom(takenPositions.below, mark.position),
	}));

	return marks.map((mark, index) => {
		const { above, below, ...markWithoutTags } = mark;
		const placed = placedTags[index]!;
		const movedBelowTag =
			below !== undefined &&
			!placed.below &&
			above === undefined &&
			claimTagRoom(takenPositions.above, mark.position);
		const movedAboveTag =
			above !== undefined &&
			!placed.above &&
			below === undefined &&
			claimTagRoom(takenPositions.below, mark.position);
		const aboveTag = selectRowTag(placed.above, above, movedBelowTag, below);
		const belowTag = selectRowTag(placed.below, below, movedAboveTag, above);

		return {
			...markWithoutTags,
			...(aboveTag !== undefined && { above: aboveTag }),
			...(belowTag !== undefined && { below: belowTag }),
		};
	});
}

/** A row shows its own tag when that was placed, or the other row's tag when it moved here. */
function selectRowTag(
	isOwnTagPlaced: boolean,
	ownTag: ReactNode,
	isOtherTagMoved: boolean,
	otherTag: ReactNode,
): ReactNode {
	if (isOwnTagPlaced) {
		return ownTag;
	}

	if (isOtherTagMoved) {
		return otherTag;
	}

	return undefined;
}

function claimTagRoom(takenPositions: number[], position: number): boolean {
	const isFree = takenPositions.every((taken) => Math.abs(taken - position) >= MINIMUM_TAG_GAP);

	if (isFree) {
		takenPositions.push(position);
	}

	return isFree;
}

function alignTag(position: number): 'start' | 'center' | 'end' {
	if (position < EDGE_ALIGNMENT_MARGIN) {
		return 'start';
	}

	if (position > 100 - EDGE_ALIGNMENT_MARGIN) {
		return 'end';
	}

	return 'center';
}

function toSpanStyle({ from, to }: RulerSpan): CSSProperties {
	const left = Math.min(from, to);
	return { left: `${left}%`, width: `${Math.abs(to - from)}%` };
}
