<script lang="ts">
	import { goto } from '$app/navigation';
	import ToastHost from '$lib/components/ToastHost.svelte';
	import { sessionStore } from '$lib/stores/session';
	import { onMount } from 'svelte';

	let { children } = $props();

	onMount(() => {
		void (async () => {
			await sessionStore.hydrate();
			if (!$sessionStore.user) {
				await goto('/login');
			}
		})();
	});
</script>

<div class="min-h-screen bg-slate-100 p-6 dark:bg-black">
	<div class="mb-4 flex items-center justify-between">
		<h1 class="text-xl font-semibold">Dashboard</h1>
		<div class="flex gap-2">
			<a class="btn-secondary" href="/dashboard/products">Productos</a>
			<a class="btn-secondary" href="/app">Volver al sistema</a>
		</div>
	</div>
	{@render children()}
</div>

<ToastHost />
