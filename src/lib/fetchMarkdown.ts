import type { PresetConfig } from '$lib/presets'
import { env } from '$env/dynamic/private'
import { dev } from '$app/environment'
import tarStream from 'tar-stream'
import { Readable } from 'stream'
import { createGunzip } from 'zlib'
import { minimatch } from 'minimatch'
import { swr } from './cache'

function sortFilesWithinGroup(files: string[]): string[] {
	return files.sort((a, b) => {
		const aPath = a.split('\n')[0].replace('## ', '')
		const bPath = b.split('\n')[0].replace('## ', '')

		// Check if one path is a parent of the other
		if (bPath.startsWith(aPath.replace('/index.md', '/'))) return -1
		if (aPath.startsWith(bPath.replace('/index.md', '/'))) return 1

		// If not parent/child relationship, sort by path
		return aPath.localeCompare(bPath)
	})
}

// Main function to fetch and process markdown files
export async function fetchAndProcessMarkdown(preset: PresetConfig): Promise<string> {
	const { value: files } = await swr(preset.title, async () => fetchMarkdownFiles(preset))
	if (dev) {
		console.log(`Fetched ${files.length} files for ${preset.title}`)
	}
	return files.join('\n\n')
}

function shouldIncludeFile(filename: string, glob: string, ignore: string[] = []): boolean {
	// First check if the file should be ignored
	const shouldIgnore = ignore.some((pattern) => minimatch(filename, pattern))
	if (shouldIgnore) {
		console.log(`❌ Ignored by pattern: ${filename}`)
		return false
	}

	// Then check if the file matches the specific glob pattern
	return minimatch(filename, glob)
}

// Fetch markdown files using GitHub's tarball API
async function fetchMarkdownFiles({
	owner,
	repo,
	glob,
	ignore = [],
	minimize = undefined
}: PresetConfig): Promise<string[]> {
	// Construct the tarball URL
	const url = `https://api.github.com/repos/${owner}/${repo}/tarball`

	if (dev) {
		console.log(`Fetching tarball from: ${url}`)
	}

	// Fetch the tarball
	const response = await fetch(url, {
		headers: {
			Authorization: `Bearer ${env.GITHUB_TOKEN}`,
			Accept: 'application/vnd.github.v3.raw'
		}
	})

	if (!response.ok) {
		throw new Error(`Failed to fetch tarball: ${response.statusText}`)
	}

	// Create a Map to store files for each glob pattern while maintaining order
	const globResults = new Map<string, string[]>()
	const filePathsByPattern = new Map<string, string[]>()
	glob.forEach((pattern) => {
		globResults.set(pattern, [])
		filePathsByPattern.set(pattern, [])
	})

	const extractStream = tarStream.extract()

	let processedFiles = 0
	let matchedFiles = 0

	// Process each file in the tarball
	extractStream.on('entry', (header, stream, next) => {
		processedFiles++
		let matched = false

		// Check each glob pattern in order
		for (const pattern of glob) {
			if (shouldIncludeFile(header.name, pattern, ignore)) {
				matched = true
				matchedFiles++

				if (header.type === 'file') {
					let content = ''
					stream.on('data', (chunk) => (content += chunk.toString()))
					stream.on('end', () => {
						// Remove the repo directory prefix and apps/svelte.dev/content
						const cleanPath = header.name
							.split('/')
							.slice(1) // Remove repo directory
							.join('/')
							.replace('apps/svelte.dev/content/', '') // Remove the fixed prefix

						// Add the file header before the content
						const contentWithHeader = `## ${cleanPath}\n\n${minimizeContent(content, minimize)}`

						// Add to the appropriate glob pattern's results
						const files = globResults.get(pattern) || []
						files.push(contentWithHeader)
						globResults.set(pattern, files)

						// Store the file path for logging
						const paths = filePathsByPattern.get(pattern) || []
						paths.push(cleanPath)
						filePathsByPattern.set(pattern, paths)

						next()
					})
					return // Exit after first match
				}
			}
		}

		if (!matched) {
			stream.resume()
			next()
		}
	})

	if (!response.body) {
		throw new Error('Response body is null')
	}

	// Create a readable stream from the response body
	const chunks: Uint8Array[] = []
	const reader = response.body.getReader()

	while (true) {
		const { done, value } = await reader.read()
		if (done) break
		chunks.push(value)
	}

	const tarballStream = Readable.from(Buffer.concat(chunks))

	// Create a gunzip stream
	const gunzipStream = createGunzip()

	// Pipe the tarball stream through gunzip to the extract stream
	tarballStream.pipe(gunzipStream).pipe(extractStream)

	// Wait for the extraction to complete
	await new Promise<void>((resolve) => extractStream.on('finish', resolve))

	if (dev) {
		console.log(`Total files processed: ${processedFiles}`)
		console.log(`Files matching glob: ${matchedFiles}`)
		console.log('\nFinal file order:')

		// Log files in their final order
		glob.forEach((pattern, index) => {
			const paths = filePathsByPattern.get(pattern) || []
			const sortedPaths = sortFilesWithinGroup(paths.map((p) => `## ${p}`)).map((p) =>
				p.replace('## ', '')
			)
			if (sortedPaths.length > 0) {
				console.log(`\nGlob pattern ${index + 1}: ${pattern}`)
				sortedPaths.forEach((path, i) => {
					console.log(`  ${i + 1}. ${path}`)
				})
			}
		})
	}

	// Combine results in the order of glob patterns
	const orderedResults: string[] = []
	for (const pattern of glob) {
		const filesForPattern = globResults.get(pattern) || []
		// Sort files within each glob pattern group
		orderedResults.push(...sortFilesWithinGroup(filesForPattern))
	}

	return orderedResults
}

export interface MinimizeOptions {
	normalizeWhitespace?: boolean
	removeLegacy?: boolean
	removePlaygroundLinks?: boolean
	removePrettierIgnore?: boolean
	removeNoteBlocks?: boolean
	removeDetailsBlocks?: boolean
	removeHtmlComments?: boolean
	removeDiffMarkers?: boolean
}

const defaultOptions: MinimizeOptions = {
	normalizeWhitespace: false,
	removeLegacy: false,
	removePlaygroundLinks: false,
	removePrettierIgnore: true,
	removeNoteBlocks: true,
	removeDetailsBlocks: true,
	removeHtmlComments: false,
	removeDiffMarkers: true
}

function removeQuoteBlocks(content: string, blockType: string): string {
	return content
		.split('\n')
		.reduce((acc: string[], line: string, index: number, lines: string[]) => {
			// If we find a block (with or without additional text), skip it and all subsequent blockquote lines
			if (line.trim().startsWith(`> [!${blockType}]`)) {
				// Skip all subsequent lines that are part of the blockquote
				let i = index
				while (i < lines.length && (lines[i].startsWith('>') || lines[i].trim() === '')) {
					i++
				}
				// Update the index to skip all these lines
				index = i - 1
				return acc
			}

			// Only add the line if it's not being skipped
			acc.push(line)
			return acc
		}, [])
		.join('\n')
}

function removeDiffMarkersFromContent(content: string): string {
	let inCodeBlock = false
	const lines = content.split('\n')
	const processedLines = lines.map((line) => {
		// Track if we're entering or leaving a code block
		if (line.trim().startsWith('\`\`\`')) {
			inCodeBlock = !inCodeBlock
			return line
		}

		// Only process lines within code blocks
		if (inCodeBlock) {
			// Handle lines that end with --- or +++ with possible whitespace after
			line = line.replace(/(\+{3}|\-{3})[\s]*$/g, '')

			// Handle triple markers at start while preserving indentation
			// This captures the whitespace before the marker and adds it back
			line = line.replace(/^(\s*)(\+{3}|\-{3})\s*/g, '$1')

			// Handle single + or - markers at start while preserving indentation
			line = line.replace(/^(\s*)[\+\-](\s)/g, '$1')

			// Handle multi-line diff blocks where --- or +++ might be in the middle of line
			line = line.replace(/[\s]*(\+{3}|\-{3})[\s]*/g, '')
		}

		return line
	})

	return processedLines.join('\n')
}

function minimizeContent(content: string, options?: Partial<MinimizeOptions>): string {
	// Merge with defaults, but only for properties that are defined
	const settings: MinimizeOptions = options ? { ...defaultOptions, ...options } : defaultOptions

	let minimized = content

	if (settings.removeDiffMarkers) {
		minimized = removeDiffMarkersFromContent(minimized)
	}

	if (settings.removeLegacy) {
		minimized = removeQuoteBlocks(minimized, 'LEGACY')
	}

	if (settings.removeNoteBlocks) {
		minimized = removeQuoteBlocks(minimized, 'NOTE')
	}

	if (settings.removeDetailsBlocks) {
		minimized = removeQuoteBlocks(minimized, 'DETAILS')
	}

	if (settings.removePlaygroundLinks) {
		// Replace playground URLs with /[link] but keep the original link text
		minimized = minimized.replace(/\[([^\]]+)\]\(\/playground[^)]+\)/g, '[$1](/REMOVED)')
	}

	if (settings.removePrettierIgnore) {
		minimized = minimized
			.split('\n')
			.filter((line) => line.trim() !== '<!-- prettier-ignore -->')
			.join('\n')
	}

	if (settings.removeHtmlComments) {
		// Replace all HTML comments (including multi-line) with empty string
		minimized = minimized.replace(/<!--[\s\S]*?-->/g, '')
	}

	if (settings.normalizeWhitespace) {
		minimized = minimized.replace(/\s+/g, ' ')
	}

	minimized = minimized.trim()

	if (dev) {
		//console.log(`Original content length: ${content.length}`)
		//console.log(`Minimized content length: ${minimized.length}`)
		//console.log('Applied minimizations:', Object.keys(settings).join(', '))
	}

	return minimized
}
