import { describe, expect, test } from 'bun:test';

import { Glob } from 'bun';

// Green and red mark gains and losses only. A rule may use them only when it styles a figure the
// page marks as a gain or a loss, or the chart legend's candles, which are gains and losses too.
const ALLOWED_SELECTOR_PATTERN = /\[data-direction='(gain|loss)'\]|\.chart-key-(up|down)/;
const COLOR_TOKEN_PATTERN = /var\(--(up|down)\)/;

const stylesheetPaths = Array.from(new Glob('*.css').scanSync(import.meta.dir));
const stylesheets = await Promise.all(
	stylesheetPaths.map(async (path) => ({
		path,
		css: (await Bun.file(`${import.meta.dir}/${path}`).text()).replaceAll(
			/\/\*[\s\S]*?\*\//g,
			'',
		),
	})),
);

describe('the color rule', () => {
	test('every rule that uses --up or --down styles a gain, a loss or a candle', () => {
		const offendingRules = stylesheets.flatMap(({ path, css }) =>
			listRules(css)
				.filter(({ body }) => COLOR_TOKEN_PATTERN.test(body))
				.filter(({ selector }) => !ALLOWED_SELECTOR_PATTERN.test(selector))
				.map(({ selector }) => `${path}: ${selector}`),
		);

		expect(stylesheets.length).toBeGreaterThan(0);
		expect(offendingRules).toEqual([]);
	});

	test('the gain and loss marks do get their colors', () => {
		const allCss = stylesheets.map(({ css }) => css).join('\n');

		expect(allCss).toMatch(/\[data-direction='gain'\]\s*\{\s*color: var\(--up\);/);
		expect(allCss).toMatch(/\[data-direction='loss'\]\s*\{\s*color: var\(--down\);/);
	});
});

/** Each innermost rule as its selector and declarations; at-rule wrappers are skipped. */
function listRules(css: string): readonly Readonly<{ selector: string; body: string }>[] {
	const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
	return rules.map((match) => ({ selector: match[1]!.trim(), body: match[2]! }));
}
