import { describe, expect, test } from 'bun:test';

import { renderToStaticMarkup } from 'react-dom/server';

import { Ruler } from './ruler.tsx';

function listTags(html: string, row: 'above' | 'below'): readonly string[] {
	const pattern = new RegExp(`ruler-tag-${row}[^>]*>([^<]*)<`, 'g');
	return [...html.matchAll(pattern)].map(([, text]) => text!);
}

describe('Ruler', () => {
	test('keeps a crowded tag by moving it to the other row', () => {
		const html = renderToStaticMarkup(
			<Ruler
				marks={[
					{ position: 50, emphasis: 'strong', below: 'pasa a ser alcista' },
					{ position: 55, emphasis: 'strong', below: 'pasa a ser bajista' },
				]}
			/>,
		);

		expect(listTags(html, 'below')).toEqual(['pasa a ser alcista']);
		expect(listTags(html, 'above')).toEqual(['pasa a ser bajista']);
	});

	test('leaves out a lower-priority tag that has room on neither row', () => {
		const html = renderToStaticMarkup(
			<Ruler
				marks={[
					{ position: 50, emphasis: 'close', above: 'cierre', below: '$ 5.805' },
					{ position: 52, emphasis: 'tick', below: '$ 5.900' },
				]}
			/>,
		);

		expect(listTags(html, 'above')).toEqual(['cierre']);
		expect(listTags(html, 'below')).toEqual(['$ 5.805']);
	});
});
