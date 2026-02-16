<script lang="ts">
	import type { ThemeMode } from '$lib/stores/theme';
	import { themeStore } from '$lib/stores/theme';

	type ThemeItem = {
		mode: ThemeMode;
		label: string;
	};

	const items: ThemeItem[] = [
		{ mode: 'system', label: 'Sistema' },
		{ mode: 'light', label: 'Claro' },
		{ mode: 'dark', label: 'Oscuro' }
	];
</script>

<div
	class="inline-flex items-center gap-1 rounded-2xl border border-white/20 bg-black/30 p-1.5 shadow-lg backdrop-blur-sm dark:border-white/15 dark:bg-black/35"
	role="group"
	aria-label="Selector de tema"
>
	{#each items as item}
		<button
			type="button"
			class={`inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-300 transition hover:text-white ${
				$themeStore === item.mode ? 'bg-black text-white shadow-inner ring-1 ring-white/25' : ''
			}`}
			onclick={() => themeStore.set(item.mode)}
			aria-label={item.label}
			title={item.label}
		>
			{#if item.mode === 'system'}
				<svg
					viewBox="0 0 24 24"
					class="h-[18px] w-[18px]"
					fill="none"
					stroke="currentColor"
					stroke-width="1.8"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<rect x="4" y="5" width="16" height="12" rx="2" />
					<path d="M8 19h8" />
				</svg>
			{:else if item.mode === 'light'}
				<svg
					viewBox="0 0 24 24"
					class="h-[18px] w-[18px]"
					fill="none"
					stroke="currentColor"
					stroke-width="1.8"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<circle cx="12" cy="12" r="4" />
					<path d="M12 2v2.5M12 19.5V22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2 12h2.5M19.5 12H22M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
				</svg>
			{:else}
				<svg
					viewBox="0 0 24 24"
					class="h-[18px] w-[18px]"
					fill="none"
					stroke="currentColor"
					stroke-width="1.8"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
				</svg>
			{/if}
		</button>
	{/each}
</div>
