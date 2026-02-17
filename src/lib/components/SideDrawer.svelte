<script lang="ts">
	import { Dialog } from 'bits-ui';
	export let open = false;
	export let title = '';
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-slate-900/40 dark:bg-black/50" />
		<Dialog.Content
			class="fixed right-0 top-0 z-50 h-screen w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white p-4 shadow-xl dark:border-neutral-800 dark:bg-black dark:text-neutral-100"
		>
			<div class="mb-4 flex items-center justify-between">
				<h3 class="text-lg font-semibold text-slate-900 dark:text-neutral-100">{title}</h3>
				<Dialog.Close class="btn-secondary">Cerrar</Dialog.Close>
			</div>
			<slot />
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
