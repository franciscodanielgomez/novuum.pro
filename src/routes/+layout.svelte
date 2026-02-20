<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import ToastHost from '$lib/components/ToastHost.svelte';
	import { themeStore } from '$lib/stores/theme';
	import { onMount } from 'svelte';

	let { children } = $props();

	onMount(() => {
		themeStore.hydrate();
	});
</script>

<svelte:head>
	<title>Novuum</title>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
<ToastHost />
