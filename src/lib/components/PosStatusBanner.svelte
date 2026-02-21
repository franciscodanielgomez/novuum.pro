<script lang="ts">
	import { sessionStore } from '$lib/stores/session';
</script>

{#if $sessionStore.authStatus === 'refreshing'}
	<div
		class="flex items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
		role="status"
	>
		<span class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" aria-hidden="true"></span>
		Reconectando…
	</div>
{:else if $sessionStore.authStatus === 'offline'}
	<div
		class="flex flex-wrap items-center justify-center gap-2 border-b border-slate-200 bg-slate-100 px-4 py-2 text-sm text-slate-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
		role="alert"
	>
		<span>Sin conexión. Mostrando datos guardados. Reintentando…</span>
		<button
			type="button"
			class="rounded border border-slate-400 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
			onclick={() => {
				void sessionStore.refreshToken();
			}}
		>
			Reintentar
		</button>
	</div>
{:else if $sessionStore.authStatus === 'hard-expired'}
	<div
		class="flex flex-wrap items-center justify-center gap-2 border-b border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200"
		role="alert"
	>
		<span>La sesión expiró. Volvé a iniciar sesión.</span>
		<button
			type="button"
			class="rounded border border-rose-500 bg-rose-600 px-2 py-1 text-xs font-medium text-white hover:bg-rose-700 dark:bg-rose-700 dark:hover:bg-rose-800"
			onclick={() => sessionStore.clearSessionAndRedirectToLogin('La sesión expiró. Volvé a iniciar sesión.')}
		>
			Iniciar sesión
		</button>
	</div>
{/if}
