/** The trend's name as a neutral chip: the trend is a reading, not a gain or a loss. */
export function TrendChip({ label }: { label: string }) {
	return (
		<span className="trend-chip">
			<svg viewBox="0 0 12 12" aria-hidden="true">
				<path
					d="M1.5 6h9M7.5 3l3 3-3 3"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.6"
					strokeLinejoin="round"
				/>
			</svg>
			{label}
		</span>
	);
}
