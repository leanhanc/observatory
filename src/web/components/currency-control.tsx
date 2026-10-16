import type { DisplayCurrency } from '#web/lib/utils/line-wording/index.ts';

const CURRENCY_LABELS: Record<DisplayCurrency, string> = {
	ars: 'ARS',
	usd: 'USD',
	ccl: 'CCL',
};

/**
 * The currency switch: one radio input per offered view, the first checked. The stylesheet shows
 * the checked view's variants with `:has()`, so the switch needs no script and no URL of its own.
 */
export function CurrencyControl({ currencies }: { currencies: readonly DisplayCurrency[] }) {
	const hasChoice = currencies.length > 1;

	if (!hasChoice) {
		return null;
	}

	return (
		<fieldset className="currency-control">
			<legend>Moneda</legend>
			{currencies.map((currency, index) => (
				<label key={currency}>
					<input
						type="radio"
						name="currency"
						id={`currency-${currency}`}
						value={currency}
						defaultChecked={index === 0}
					/>
					{CURRENCY_LABELS[currency]}
				</label>
			))}
		</fieldset>
	);
}
