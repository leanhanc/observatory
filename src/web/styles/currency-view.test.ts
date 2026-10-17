import { describe, expect, test } from 'bun:test';

const stylesheet = await Bun.file(new URL('./currency-view.css', import.meta.url)).text();
const stylesheetWithoutComments = stylesheet.replaceAll(/\/\*[\s\S]*?\*\//g, '');
const hasSupportsStart = stylesheetWithoutComments.indexOf('@supports selector(:has(*))');
const outsideHasSupports = stylesheetWithoutComments.slice(0, hasSupportsStart);
const insideHasSupports = stylesheetWithoutComments.slice(hasSupportsStart);

// A browser without `:has()` drops a whole rule over one selector it does not support, and the
// build's minifier merges adjacent rules with the same declarations into one selector list. So
// every `:has()` rule sits in an `@supports` block, which neither crosses, and these tests read the
// stylesheet's structure rather than render it in such a browser.
describe('currency-view stylesheet', () => {
	test('hides the USD and CCL variants outside the `:has()` block', () => {
		const hidingRule = outsideHasSupports.match(
			/\[data-currency-view='usd'\],\s*\[data-currency-view='ccl'\]\s*\{\s*display: none;\s*\}/,
		);

		expect(hasSupportsStart).toBeGreaterThan(0);
		expect(hidingRule).not.toBeNull();
	});

	test('uses `:has()` only inside the `@supports` block', () => {
		expect(outsideHasSupports).not.toContain(':has(');
		expect(insideHasSupports).toContain(
			":root:has(#currency-usd:checked) [data-currency-view='ars']",
		);
	});

	test('hides the radio inputs only where `:has()` can mark the checked label', () => {
		expect(outsideHasSupports).not.toContain('opacity: 0');
		expect(insideHasSupports).toContain('opacity: 0');
		expect(insideHasSupports).toContain('label:has(input:checked)');
	});
});
