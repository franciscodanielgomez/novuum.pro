<script lang="ts">
	import type { OrderStatus } from '$lib/types';
	export let status: OrderStatus;

	const labels: Record<OrderStatus, string> = {
		NO_ASIGNADO: 'No asignado',
		ASIGNADO: 'Asignado',
		COMPLETADO: 'Completado',
		CANCELADO: 'Cancelado'
	};
</script>

<span
	class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
	class:bg-rose-100={status === 'NO_ASIGNADO'}
	class:text-rose-800={status === 'NO_ASIGNADO'}
	class:bg-amber-100={status === 'ASIGNADO'}
	class:text-amber-800={status === 'ASIGNADO'}
	class:bg-emerald-100={status === 'COMPLETADO'}
	class:text-emerald-800={status === 'COMPLETADO'}
	class:bg-slate-200={status === 'CANCELADO'}
	class:text-slate-700={status === 'CANCELADO'}
>
	{labels[status]}
</span>
