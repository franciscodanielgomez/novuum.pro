<script lang="ts">
	/**
	 * Botón reutilizable para filtrar por estado en la pantalla de Pedidos.
	 * Estilos centralizados para modo claro y oscuro.
	 */
	export type StatusFilterValue =
		| 'TODOS'
		| 'BORRADOR'
		| 'NO_ASIGNADO'
		| 'ASIGNADO'
		| 'COMPLETADO'
		| 'CANCELADO';

	interface Props {
		status: StatusFilterValue;
		active: boolean;
		onClick: () => void;
	}

	let { status, active, onClick }: Props = $props();

	const BASE =
		'rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';

	const STYLES: Record<
		StatusFilterValue,
		{ active: string; inactive: string }
	> = {
		TODOS: {
			active:
				'bg-slate-800 text-white hover:bg-slate-700 shadow-sm ring-1 ring-slate-700 ring-offset-1 dark:bg-slate-600 dark:text-white dark:hover:bg-slate-500 dark:ring-slate-500',
			inactive:
				'border border-slate-400 text-slate-700 hover:bg-slate-100 dark:border-slate-500 dark:text-slate-300 dark:hover:bg-slate-700'
		},
		BORRADOR: {
			active:
				'bg-violet-600 text-white hover:bg-violet-700 shadow-sm ring-1 ring-violet-700 ring-offset-1 dark:bg-violet-700 dark:hover:bg-violet-600 dark:ring-violet-600',
			inactive:
				'border border-violet-500 text-violet-600 hover:bg-violet-50 dark:border-violet-500 dark:text-violet-400 dark:hover:bg-violet-900/30'
		},
		NO_ASIGNADO: {
			active:
				'bg-red-600 text-white hover:bg-red-700 shadow-sm ring-1 ring-red-700 ring-offset-1 dark:bg-red-700 dark:hover:bg-red-600 dark:ring-red-600',
			inactive:
				'border border-red-600 text-red-600 hover:bg-red-50 dark:border-red-500 dark:text-red-400 dark:hover:bg-red-900/30'
		},
		ASIGNADO: {
			active:
				'bg-amber-500 text-slate-900 hover:bg-amber-600 shadow-sm ring-1 ring-amber-600 ring-offset-1 dark:bg-amber-600 dark:text-black dark:hover:bg-amber-500 dark:ring-amber-500',
			inactive:
				'border border-amber-500 text-amber-600 hover:bg-amber-50 dark:border-amber-500 dark:text-amber-400 dark:hover:bg-amber-900/30'
		},
		COMPLETADO: {
			active:
				'bg-green-600 text-white hover:bg-green-700 shadow-sm ring-1 ring-green-700 ring-offset-1 dark:bg-green-700 dark:hover:bg-green-600 dark:ring-green-600',
			inactive:
				'border border-green-600 text-green-600 hover:bg-green-50 dark:border-green-500 dark:text-green-400 dark:hover:bg-green-900/30'
		},
		CANCELADO: {
			active:
				'bg-gray-500 text-white hover:bg-gray-600 shadow-sm ring-1 ring-gray-600 ring-offset-1 dark:bg-gray-600 dark:hover:bg-gray-500 dark:ring-gray-500',
			inactive:
				'border border-gray-500 text-gray-600 hover:bg-gray-100 dark:border-gray-500 dark:text-gray-400 dark:hover:bg-gray-800'
		}
	};

	const LABELS: Record<StatusFilterValue, string> = {
		TODOS: 'Todos',
		BORRADOR: 'Borrador',
		NO_ASIGNADO: 'No asignado',
		ASIGNADO: 'Asignado',
		COMPLETADO: 'Completado',
		CANCELADO: 'Cancelado'
	};

	const classes = $derived(
		`${BASE} ${active ? STYLES[status].active : STYLES[status].inactive}`
	);
	const label = $derived(LABELS[status]);
</script>

<button
	type="button"
	class={classes}
	onclick={onClick}
	aria-pressed={active}
>
	{label}
</button>
