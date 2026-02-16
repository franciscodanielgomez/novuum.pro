<script lang="ts">
	import { toastsStore } from '$lib/stores/toasts';
</script>

<div class="pointer-events-none fixed right-4 top-4 z-50 flex w-80 flex-col gap-2">
	{#each $toastsStore as toast (toast.id)}
		<div
			class="pointer-events-auto rounded-lg border px-3 py-2 text-sm shadow-md dark:border-slate-700 dark:bg-black dark:text-slate-100"
			class:bg-white={toast.variant !== 'info'}
			class:border-slate-200={toast.variant !== 'info'}
			class:text-slate-800={toast.variant !== 'info'}
			class:bg-slate-900={toast.variant === 'info'}
			class:border-slate-700={toast.variant === 'info'}
			class:text-white={toast.variant === 'info'}
		>
			{toast.title}
		</div>
	{/each}
</div>
