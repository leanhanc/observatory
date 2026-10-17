import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AstroIntegration } from 'astro';

// The storage markers catch configuration that would let a reader reach the bucket: any variable
// name, and the bucket endpoint's host.
const STORAGE_MARKERS = ['OBSERVATORY_STORAGE', 'storageapi'] as const;
const SCRIPT_MARKER = '<script';
const MODULE_PRELOAD_MARKER = 'modulepreload';
// The chart island's bundle is the only script a page may carry: one external module from the
// build's assets, with nothing inline.
const ISLAND_SCRIPT_PATTERN = /<script type="module" src="\/_astro\/[^"]+\.js"><\/script>/gi;
const SCRIPT_TAG_PATTERN = /<script/gi;
// An available line's page is the only page with a chart, so it is the only one with an island.
const ISLAND_ELEMENT_MARKER = '<line-chart';

export type PublishedOutputViolation = Readonly<{
	file: string;
	markers: readonly string[];
}>;

/**
 * Fails the build when a published file carries storage configuration, or a page carries a script
 * other than the chart island's single bundled module on an available line's page.
 */
export function guardPublishedOutput(): AstroIntegration {
	return {
		name: 'observatory:published-output-guard',
		hooks: {
			'astro:build:done': async ({ dir }) => {
				const violations = await findPublishedOutputViolations(fileURLToPath(dir));

				if (violations.length === 0) {
					return;
				}

				const violationLines = violations.map(
					({ file, markers }) => `- ${file}: ${markers.join(', ')}`,
				);
				throw new Error(
					`The published output contains forbidden content:\n${violationLines.join('\n')}`,
				);
			},
		},
	};
}

/**
 * Lists every file under `outputDirectory` that breaks a rule, with paths relative to it. Markers
 * are matched ignoring case.
 */
export async function findPublishedOutputViolations(
	outputDirectory: string,
): Promise<PublishedOutputViolation[]> {
	const entries = await readdir(outputDirectory, { recursive: true, withFileTypes: true });
	const filePaths = entries
		.filter((entry) => entry.isFile())
		.map((entry) => join(entry.parentPath, entry.name));
	const fileViolations = await Promise.all(
		filePaths.map((filePath) => findFileViolation(outputDirectory, filePath)),
	);

	return fileViolations.filter((violation) => violation !== null);
}

async function findFileViolation(
	outputDirectory: string,
	filePath: string,
): Promise<PublishedOutputViolation | null> {
	const content = await readFile(filePath, 'utf8');
	const file = relative(outputDirectory, filePath);
	const lowerContent = content.toLowerCase();
	const storageMarkers = STORAGE_MARKERS.filter((marker) =>
		lowerContent.includes(marker.toLowerCase()),
	);
	const isPage = file.endsWith('.html');
	const scriptMarkers = isPage ? findScriptViolations(file, content) : [];
	const markers = [...storageMarkers, ...scriptMarkers];

	if (markers.length === 0) {
		return null;
	}

	return { file, markers };
}

function findScriptViolations(file: string, content: string): readonly string[] {
	const lowerContent = content.toLowerCase();
	const scriptCount = lowerContent.match(SCRIPT_TAG_PATTERN)?.length ?? 0;
	const islandScriptCount = content.match(ISLAND_SCRIPT_PATTERN)?.length ?? 0;
	const hasModulePreload = lowerContent.includes(MODULE_PRELOAD_MARKER);
	const isLinePage = file.startsWith(`lines${sep}`) && file.endsWith(`${sep}index.html`);
	const hasIsland = isLinePage && content.includes(ISLAND_ELEMENT_MARKER);
	const hasOneIslandScript = scriptCount === 1 && islandScriptCount === 1;
	// A page with a chart must carry exactly its island's script; any other page carries none.
	const hasForbiddenScript = hasIsland ? !hasOneIslandScript : scriptCount > 0;

	return [
		...(hasForbiddenScript ? [SCRIPT_MARKER] : []),
		...(hasModulePreload ? [MODULE_PRELOAD_MARKER] : []),
	];
}
