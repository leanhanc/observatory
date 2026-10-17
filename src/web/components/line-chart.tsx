import type { ReactNode } from 'react';

// React renders unknown lowercase tags as custom elements; this names the island's attributes.
declare module 'react' {
	// oxlint-disable-next-line typescript/no-namespace -- JSX intrinsic elements are declared on this namespace.
	namespace JSX {
		interface IntrinsicElements {
			'line-chart': { 'data-src': string; class?: string; children?: ReactNode };
		}
	}
}

const RANGES = [
	{ value: '1', label: '1m' },
	{ value: '3', label: '3m' },
	{ value: '6', label: '6m' },
	{ value: '12', label: '1a' },
	{ value: 'all', label: 'Todo' },
] as const;

const OPENING_RANGE = '12';

type LineChartProps = Readonly<{
	ticker: string;
	chartDataPath: string;
	/** The currency control, which the chart follows; it sits on the range control's row. */
	currencyControl: ReactNode;
	/** What the checked currency view's prices are, under the controls. */
	currencyNote: ReactNode;
}>;

/**
 * The chart island's static markup: the controls row, the box the chart draws in, its legend and
 * the attribution its license asks for. Without JavaScript the box shows a note, and the range
 * control stays hidden, since only the island can act on it.
 */
export function LineChart({
	ticker,
	chartDataPath,
	currencyControl,
	currencyNote,
}: LineChartProps) {
	return (
		<line-chart data-src={chartDataPath}>
			<div className="chart-controls">
				{currencyControl}
				<fieldset className="segmented chart-range">
					<legend className="visually-hidden">Período del gráfico</legend>
					{RANGES.map(({ value, label }) => (
						<label key={value}>
							<input
								type="radio"
								name="chart-range"
								value={value}
								defaultChecked={value === OPENING_RANGE}
							/>
							{label}
						</label>
					))}
				</fieldset>
			</div>
			{currencyNote}
			<div
				className="chart-box"
				role="img"
				aria-label={`Gráfico de velas diarias de ${ticker} con el soporte y la resistencia`}
			>
				<p className="chart-note">El gráfico no está disponible.</p>
			</div>
			<ul className="chart-legend">
				<li>
					<span className="chart-key chart-key-up" />
					Rueda que cerró arriba de su apertura
				</li>
				<li>
					<span className="chart-key chart-key-down" />
					Rueda que cerró abajo
				</li>
				<li>
					<span className="chart-key chart-key-level" />
					Soporte y resistencia
				</li>
			</ul>
			<p className="chart-credit">
				<a href="https://www.tradingview.com/">
					Gráfico: TradingView Lightweight Charts™, © 2025 TradingView, Inc.
				</a>
			</p>
		</line-chart>
	);
}
