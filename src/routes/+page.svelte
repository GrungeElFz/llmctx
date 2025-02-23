<script lang="ts">
	import { combinedPresets, sveltePresets, svelteKitPresets, otherPresets, transformAndSortPresets } from '$lib/presets'
	import PresetListItem from '$lib/components/PresetListItem.svelte'
	import { SITE_URL } from '$lib/constants'

	const combinedPresetsFormatted = transformAndSortPresets(combinedPresets)
	const sveltePresetsFormatted = transformAndSortPresets(sveltePresets)
	const svelteKitPresetsFormatted = transformAndSortPresets(svelteKitPresets)
	const otherPresetsFormatted = transformAndSortPresets(otherPresets)

	const instructions = [
		{
			title: 'Cursor',
			description: `Cursor supports adding context via URL using the <a href="https://docs.cursor.com/context/@-symbols/@-link#paste-links">Paste Links</a> feature.`,
			command: `@${SITE_URL}/[preset]`
		},
		{
			title: 'Zed',
			description:
				'You can use this project directly in Zed using a <a href="https://zed.dev/docs/assistant/commands">/fetch command</a>.',
			command: `/fetch ${SITE_URL}/[preset]`
		},
		{
			title: 'cURL',
			description: `Let's be real—if you clicked this, you probably already know how to use cURL. But if you don't, here's a quick example:`,
			command: `curl ${SITE_URL}/[preset] -o context.txt`
		}
	]
</script>

<main>
	<article>
		<div>svelte-llm</div>
		<h1>Developer documentation for Svelte in an LLM-ready format</h1>

		<p>
			This site provides Svelte 5 and SvelteKit documentation in an LLM-friendly format, also known
			as <em>llms.txt</em>. Pick a preset and get an AI-ready context text file. Perfect for coding
			with AI assistants like Cursor or Zed, or uploading to Claude Projects.
		</p>
		<p>
			Documentation is automatically fetched from the <a target="_blank" href="https://github.com/sveltejs/svelte.dev/tree/main/apps/svelte.dev/content">official documentation</a> source on GitHub and
			updated hourly.
		</p>
	</article>

	<section>
		<h3>Single preset:</h3>
		<p>
			<code>{SITE_URL}/</code><code>[preset]</code> (<a href="/svelte-complete-medium">Link</a>)
		</p>
		<h3>Multiple presets:</h3>
		<p>
			<code>{SITE_URL}/</code><code>svelte,sveltekit,svelte-cli</code> (<a
				href="/svelte,sveltekit,svelte-cli">Link</a
			>)
		</p>
		<h2>Combined presets</h2>
		<em>
			Hand-picked combinations of the Svelte 5 + SvelteKit docs in a variety of sizes to fit different LLMs.
		</em>
		<ul>
			{#each combinedPresetsFormatted as preset}
				<PresetListItem {...preset} />
			{/each}
		</ul>

		<h2>Svelte 5</h2>
		<ul>
			{#each sveltePresetsFormatted as preset}
				<PresetListItem {...preset} />
			{/each}
		</ul>

		<h2>SvelteKit</h2>
		<ul>
			{#each svelteKitPresetsFormatted as preset}
				<PresetListItem {...preset} />
			{/each}
		</ul>

		<h2>Other</h2>
		<ul>
			{#each otherPresetsFormatted as preset}
				<PresetListItem {...preset} />
			{/each}
		</ul>

		<h2>Legacy</h2>
		<ul>
			<li><a target="_blank" href="https://v4.svelte.dev/content.json">Svelte 4 Legacy + SvelteKit</a></li>
		</ul>
	</section>

	<br />
	{#each instructions as { title, description, command }}
		<details>
			<summary>{title}</summary>
			<p>{@html description}</p>
			<pre><code>{command}</code></pre>
		</details>
	{/each}

	<br />
	<footer>
		Maintained by <a href="https://khromov.se" target="_blank">Stanislav Khromov</a>. Forked from
		<a target="_blank" href="https://twitter.com/didiercatz">Didier Catz</a>.
	</footer>
</main>

<style>

	main {
		max-width: 42em;
		margin: 15 auto;
	}

	details summary {
		cursor: pointer;
	}
</style>
