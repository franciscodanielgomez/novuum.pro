<script lang="ts">
	import SideDrawer from '$lib/components/SideDrawer.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { ordersStore } from '$lib/stores/orders';
	import { staffStore } from '$lib/stores/staff';
	import { toastsStore } from '$lib/stores/toasts';
	import type { Order, OrderStatus } from '$lib/types';
	import { formatMoney, todayYmd } from '$lib/utils';
	import { onMount } from 'svelte';

	let query = '';
	let statusFilter: OrderStatus | 'ALL' = 'ALL';
	let dateFilter = todayYmd();
	let selectedOrder: Order | null = null;
	let drawerOpen = false;
	const cadeteByOrder: Record<string, string> = {};

	$: cadetes = $staffStore.filter((s) => s.role === 'CADETE' && s.active);
	$: filtered = $ordersStore.filter((order) => {
		const text = `${order.id} ${order.customerPhoneSnapshot} ${order.addressSnapshot}`.toLowerCase();
		const matchText = !query || text.includes(query.toLowerCase());
		const matchStatus = statusFilter === 'ALL' || order.status === statusFilter;
		const matchDate = !dateFilter || order.createdAt.slice(0, 10) === dateFilter;
		return matchText && matchStatus && matchDate;
	});

	const getCadeteName = (order: Order) => cadetes.find((c) => c.id === order.assignedStaffId)?.name ?? '-';

	const assignOrder = async (orderId: string) => {
		const staffId = cadeteByOrder[orderId];
		if (!staffId) return;
		await ordersStore.assign(orderId, staffId);
		toastsStore.success('Pedido asignado');
	};

	const updateStatus = async (orderId: string, status: OrderStatus) => {
		await ordersStore.updateStatus(orderId, status);
		toastsStore.success('Pedido actualizado');
	};

	onMount(async () => {
		await Promise.all([ordersStore.load(), staffStore.load()]);
	});
</script>

<div class="space-y-4">
	<div class="panel p-4">
		<div class="grid grid-cols-1 gap-3 lg:grid-cols-4">
			<input class="input" placeholder="Buscar ID, teléfono, dirección o cliente" bind:value={query} />
			<div class="flex flex-wrap gap-2 lg:col-span-2">
				{#each ['ALL', 'NO_ASIGNADO', 'ASIGNADO', 'COMPLETADO', 'CANCELADO'] as status}
					<button
						class="rounded-full border px-3 py-1 text-xs"
						class:bg-slate-800={statusFilter === status}
						class:text-white={statusFilter === status}
						onclick={() => (statusFilter = status as typeof statusFilter)}
					>
						{status === 'ALL' ? 'Todos' : status}
					</button>
				{/each}
			</div>
			<input class="input" type="date" bind:value={dateFilter} />
		</div>
	</div>

	<div class="panel overflow-auto">
		<table class="min-w-full text-sm">
			<thead class="bg-slate-50 dark:bg-slate-800">
				<tr>
					<th class="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">ID</th>
					<th class="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Hora</th>
					<th class="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Cliente/Teléfono</th>
					<th class="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Dirección</th>
					<th class="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Entre</th>
					<th class="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Paga con</th>
					<th class="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Total</th>
					<th class="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Caja</th>
					<th class="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Cadete</th>
					<th class="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Estado</th>
					<th class="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Acciones</th>
				</tr>
			</thead>
			<tbody>
				{#each filtered as row}
					<tr class="border-t border-slate-100 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/40">
						<td class="whitespace-nowrap px-3 py-2">{row.id}</td>
						<td class="whitespace-nowrap px-3 py-2">{row.hour}</td>
						<td class="whitespace-nowrap px-3 py-2">{row.customerPhoneSnapshot}</td>
						<td class="whitespace-nowrap px-3 py-2">{row.addressSnapshot}</td>
						<td class="whitespace-nowrap px-3 py-2">{row.betweenStreetsSnapshot ?? '-'}</td>
						<td class="whitespace-nowrap px-3 py-2">{row.paymentMethod}</td>
						<td class="whitespace-nowrap px-3 py-2">{formatMoney(row.total)}</td>
						<td class="whitespace-nowrap px-3 py-2">{row.cashierNameSnapshot ?? '-'}</td>
						<td class="whitespace-nowrap px-3 py-2">{getCadeteName(row)}</td>
						<td class="whitespace-nowrap px-3 py-2"><StatusBadge status={row.status} /></td>
						<td class="px-3 py-2">
							<div class="flex flex-wrap gap-2">
								<button
									class="btn-secondary !px-2 !py-1 text-xs"
									onclick={() => {
										selectedOrder = row;
										drawerOpen = true;
									}}
								>
									Ver
								</button>
								<select class="input !w-36 !py-1 text-xs" bind:value={cadeteByOrder[row.id]}>
									<option value="">Cadete</option>
									{#each cadetes as cadete}
										<option value={cadete.id}>{cadete.name}</option>
									{/each}
								</select>
								<button class="btn-secondary !px-2 !py-1 text-xs" onclick={() => assignOrder(row.id)}>Asignar</button>
								<button
									class="btn-secondary !px-2 !py-1 text-xs"
									onclick={() => updateStatus(row.id, 'COMPLETADO')}
								>
									Completar
								</button>
								<button class="btn-danger !px-2 !py-1 text-xs" onclick={() => updateStatus(row.id, 'CANCELADO')}>Cancelar</button>
								<a class="btn-secondary !px-2 !py-1 text-xs" href={`/app/pedidos/${row.id}/editar`}>Editar</a>
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<SideDrawer bind:open={drawerOpen} title="Detalle del pedido">
	{#if selectedOrder}
		<div class="space-y-4 text-sm">
			<div>
				<p class="font-medium">Pedido {selectedOrder.id}</p>
				<p class="text-slate-500">{selectedOrder.hour} - {selectedOrder.addressSnapshot}</p>
			</div>
			<div class="space-y-2">
				{#each selectedOrder.items as item}
					<div class="flex items-center justify-between rounded border border-slate-200 px-2 py-1 dark:border-slate-700">
						<span>{item.qty}x {item.nameSnapshot}</span>
						<span>{formatMoney(item.subtotal)}</span>
					</div>
				{/each}
			</div>
			<p>Total: <strong>{formatMoney(selectedOrder.total)}</strong></p>
		</div>
	{/if}
</SideDrawer>
