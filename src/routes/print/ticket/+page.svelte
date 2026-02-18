<script lang="ts">
	import { getStoredTicketText } from '$lib/printing/printer';
	import { onMount } from 'svelte';

	let ticketText = $state('');

	onMount(() => {
		ticketText = getStoredTicketText() ?? '';
		// Pequeño delay para que se renderice antes de abrir el diálogo de impresión
		const t = setTimeout(() => {
			window.print();
		}, 300);
		return () => clearTimeout(t);
	});
</script>

<svelte:head>
	<title>Imprimir ticket</title>
	<style>
		@media print {
			body { margin: 0; padding: 0.5in; font-family: 'Courier New', monospace; font-size: 12pt; }
			.ticket-pre { white-space: pre; margin: 0; }
		}
	</style>
</svelte:head>

<div class="ticket-pre">{ticketText || 'Sin contenido para imprimir.'}</div>
<style>
	.ticket-pre {
		font-family: 'Courier New', Consolas, monospace;
		font-size: 12pt;
		white-space: pre;
		max-width: 32ch;
		margin: 0 auto;
		padding: 0.5rem;
	}
</style>
