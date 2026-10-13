import type { Phrase } from '#web/lib/utils/line-wording/index.ts';

/** Renders a wording-table phrase, with its leads in bold. */
export function PhraseText({ phrase }: { phrase: Phrase }) {
	return (
		<>
			{phrase.map((segment, index) =>
				typeof segment === 'string' ? (
					segment
				) : (
					<strong key={index}>{segment.strong}</strong>
				),
			)}
		</>
	);
}
