import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AstroIntegration } from 'astro';

// `<script` holds only while no page has an island. The first island relaxes it deliberately, for
// that island's scripts only. The storage markers catch configuration that would let a reader
// reach the bucket: any variable name, and the bucket endpoint's host.
const FORBIDDEN_MARKERS = ['<script', 'OBSERVATORY_STORAGE', 'storageapi'] as const;

export type PublishedOutputViolation = Readonly<{
	file: string;
	markers: readonly string[];
}>;

/** Fails the build when a published file contains a script tag or storage configuration. */
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
 * Lists every file under `outputDirectory` that contains a forbidden marker, ignoring case, with
 * paths relative to it.
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
	const content = (await readFile(filePath, 'utf8')).toLowerCase();
	const markers = FORBIDDEN_MARKERS.filter((marker) => content.includes(marker.toLowerCase()));

	if (markers.length === 0) {
		return null;
	}

	return { file: relative(outputDirectory, filePath), markers };
}
