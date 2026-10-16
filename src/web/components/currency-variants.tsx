import type { DisplayCurrency } from '#web/lib/utils/line-wording/index.ts';
import type { ReactNode } from 'react';

type CurrencyVariantsProps = {
	currencies: readonly DisplayCurrency[];
	/** `div` for variants that hold block content, such as a list. */
	as?: 'span' | 'div';
	render: (currency: DisplayCurrency) => ReactNode;
};

/**
 * Renders one variant per offered currency, each marked with its view, so CSS can show the checked
 * view's and hide the others without JavaScript. A page with one view renders it unmarked.
 */
export function CurrencyVariants({
	currencies,
	as: Element = 'span',
	render,
}: CurrencyVariantsProps) {
	const [onlyCurrency] = currencies;
	const hasOneView = currencies.length === 1 && onlyCurrency !== undefined;

	if (hasOneView) {
		return <>{render(onlyCurrency)}</>;
	}

	return (
		<>
			{currencies.map((currency) => (
				<Element key={currency} data-currency-view={currency}>
					{render(currency)}
				</Element>
			))}
		</>
	);
}
