<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import ToastHost from '$lib/components/ToastHost.svelte';
	import { desktopDownloadStore } from '$lib/desktop-download';
	import { isTauri } from '$lib/printing/printer';
	import LogoNovuum from '$lib/components/LogoNovuum.svelte';
	import { businessStore } from '$lib/stores/business';
	import { sessionStore } from '$lib/stores/session';
	import { themeStore } from '$lib/stores/theme';
	import { updateStore } from '$lib/stores/updateStore';
	import { onMount, tick } from 'svelte';

	let { children } = $props();
	let sidebarCollapsed = $state(false);
	let avatarMenuOpen = $state(false);
	let businessMenuOpen = $state(false);
	let avatarButtonRef: HTMLButtonElement | undefined = $state();
	let avatarDropdownStyle = $state<{ bottom: string; left: string }>({ bottom: '0', left: '0' });

	$effect(() => {
		if (avatarMenuOpen && avatarButtonRef) {
			// Recalcular posición después de que el dropdown esté en el DOM
			tick().then(() => {
				if (!avatarButtonRef) return;
				const rect = avatarButtonRef.getBoundingClientRect();
				avatarDropdownStyle = {
					bottom: `${window.innerHeight - rect.top + 8}px`,
					left: `${rect.left}px`
				};
			});
		}
	});

	// Al abrir el POS (icono o +), colapsar el menú para dar más espacio
	$effect(() => {
		if ($page.url.pathname === '/app/create_order') {
			sidebarCollapsed = true;
		}
	});

	const goProfile = async () => {
		avatarMenuOpen = false;
		await goto('/app/profile');
	};

	const toggleTheme = () => {
		themeStore.toggle();
		avatarMenuOpen = false;
	};

	const logout = async () => {
		avatarMenuOpen = false;
		await sessionStore.logout();
	};

	const companyInitials = (name: string) => {
		const trimmed = name.trim();
		if (!trimmed) return 'NG';
		const parts = trimmed.split(/\s+/).filter(Boolean);
		if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
		return (parts[0][0] + parts[1][0]).toUpperCase();
	};

	const navGroups = [
		{
			title: 'Ventas',
			items: [
				{ href: '/app/orders', label: 'Pedidos', icon: 'pedidos' },
				{ href: '/app/clients', label: 'Clientes', icon: 'clientes' }
			]
		},
		{
			title: 'Catálogo',
			items: [
				{ href: '/app/products', label: 'Productos', icon: 'productos' },
				{ href: '/app/categories', label: 'Categorías', icon: 'categories' },
				{ href: '/app/groups', label: 'Grupos', icon: 'groups' }
			]
		},
		{
			title: 'Administración',
			items: [
				{ href: '/app/business', label: 'Negocio', icon: 'negocio' },
				{ href: '/app/team', label: 'Equipo', icon: 'equipo' },
				{ href: '/app/settings', label: 'Configuraciones', icon: 'config' }
			]
		}
	];
	// Lista plana para cuando el menú está colapsado (solo iconos)
	const items = navGroups.flatMap((g) => g.items);

	onMount(() => {
		void (async () => {
			await Promise.all([sessionStore.hydrate(), businessStore.load()]);
			if (!$sessionStore.user) {
				await goto('/login');
			}
		})();
		if (isTauri()) {
			updateStore.init();
		} else {
			desktopDownloadStore.init();
		}
	});

	// Cerrar menú avatar al hacer clic fuera (botón y dropdown tienen stopPropagation / están excluidos)
	$effect(() => {
		if (!avatarMenuOpen) return;
		const handler = (e: MouseEvent) => {
			const target = e.target as Node;
			if (avatarButtonRef?.contains(target)) return;
			const dropdown = document.querySelector('[data-avatar-dropdown]');
			if (dropdown?.contains(target)) return;
			avatarMenuOpen = false;
		};
		document.addEventListener('click', handler, true);
		return () => document.removeEventListener('click', handler, true);
	});

</script>

{#if !$sessionStore.ready}
	<div class="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-100 dark:bg-black">
		<LogoNovuum width={180} />
		<p class="text-slate-600 dark:text-neutral-400">Cargando sesión…</p>
	</div>
{:else if !$sessionStore.user}
	<div class="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-100 dark:bg-black">
		<LogoNovuum width={180} />
		<p class="text-slate-600 dark:text-neutral-400">Redirigiendo al inicio de sesión…</p>
	</div>
{:else}
<div class="flex h-screen overflow-hidden bg-slate-100 dark:bg-black">
	<aside
		class="flex h-screen shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white transition-all dark:border-neutral-800 dark:bg-black"
		class:w-52={!sidebarCollapsed}
		class:w-20={sidebarCollapsed}
	>
		<div
			class="flex h-14 items-center border-b border-slate-200 dark:border-neutral-800"
			class:px-4={!sidebarCollapsed}
			class:px-3={sidebarCollapsed}
			class:py-2={sidebarCollapsed}
		>
			<div class="flex w-full items-center" class:justify-start={!sidebarCollapsed} class:justify-center={sidebarCollapsed}>
				<div class="inline-flex items-center justify-center text-slate-900 dark:text-white" title="Novuum">
					{#if sidebarCollapsed}
						<!-- Icono N cuando el menú está colapsado -->
						<svg class="shrink-0" width="19" height="17" viewBox="0 0 59 53" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
							<path d="M58.4961 52.7832H45.8008V23.4863C45.8008 21.8262 45.5078 20.3451 44.9219 19.043C44.3685 17.7083 43.6035 16.569 42.627 15.625C41.6504 14.681 40.4948 13.9648 39.1602 13.4766C37.8581 12.9557 36.4421 12.6953 34.9121 12.6953H12.6953V52.7832H0V6.29883C0 5.41992 0.16276 4.60612 0.488281 3.85742C0.813802 3.07617 1.26953 2.40885 1.85547 1.85547C2.44141 1.26953 3.125 0.813802 3.90625 0.488281C4.6875 0.16276 5.51758 0 6.39648 0H35.0098C36.6048 0 38.2812 0.179036 40.0391 0.537109C41.8294 0.895182 43.5872 1.48112 45.3125 2.29492C47.0703 3.07617 48.7305 4.08529 50.293 5.32227C51.888 6.52669 53.2878 8.00781 54.4922 9.76562C55.7292 11.4909 56.7057 13.4928 57.4219 15.7715C58.138 18.0501 58.4961 20.6217 58.4961 23.4863V52.7832Z" fill="currentColor"/>
						</svg>
					{:else}
						<LogoNovuum width={132} />
					{/if}
				</div>
			</div>
		</div>

		<div class="flex min-h-0 flex-1 flex-col p-4">
		<div class="mb-4">
			{#if sidebarCollapsed}
				<div class="relative flex justify-center">
					<button
						class="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 dark:border-neutral-700 dark:bg-black dark:text-neutral-100 dark:hover:bg-neutral-900"
						title="{$businessStore.companyName} - {$businessStore.branchName}"
						onclick={() => (businessMenuOpen = !businessMenuOpen)}
					>
						{#if $businessStore.logoUrl}
							<img
								src={$businessStore.logoUrl}
								alt={$businessStore.companyName}
								class="h-8 w-8 rounded-full object-cover"
							/>
						{:else}
							<div class="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white dark:bg-white dark:text-slate-900">
								{companyInitials($businessStore.companyName)}
							</div>
						{/if}
					</button>
				</div>
			{:else}
				<div class="relative">
					<button
						class="flex w-full items-center gap-2 rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-left shadow-sm transition hover:bg-slate-50 dark:border-neutral-700 dark:bg-black dark:hover:bg-neutral-900"
						onclick={() => (businessMenuOpen = !businessMenuOpen)}
						aria-label="Seleccionar negocio"
						title="Seleccionar negocio"
					>
						{#if $businessStore.logoUrl}
							<img
								src={$businessStore.logoUrl}
								alt={$businessStore.companyName}
								class="h-8 w-8 rounded-full object-cover"
							/>
						{:else}
							<div class="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-[10px] font-semibold uppercase tracking-tight text-white dark:bg-white dark:text-slate-900">
								{companyInitials($businessStore.companyName)}
							</div>
						{/if}
						<div class="min-w-0 flex-1">
							<p class="truncate text-base font-semibold leading-5 text-slate-900 dark:text-neutral-100">
								{$businessStore.companyName}
							</p>
							<p class="truncate text-xs leading-4 text-slate-500 dark:text-neutral-400">{$businessStore.branchName}</p>
						</div>
						<svg
							viewBox="0 0 20 20"
							class="h-4 w-4 text-slate-500 transition-transform dark:text-neutral-400"
							class:rotate-180={businessMenuOpen}
							fill="none"
						>
							<path d="M5 7.5l5 5 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
						</svg>
					</button>

					{#if businessMenuOpen}
						<div class="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-neutral-700 dark:bg-black">
							<button
								class="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-100 dark:hover:bg-neutral-900"
								onclick={() => (businessMenuOpen = false)}
							>
								{#if $businessStore.logoUrl}
									<img
										src={$businessStore.logoUrl}
										alt={$businessStore.companyName}
										class="h-8 w-8 rounded-full object-cover"
									/>
								{:else}
									<div class="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold uppercase text-white dark:bg-white dark:text-slate-900">
										{companyInitials($businessStore.companyName)}
									</div>
								{/if}
								<div>
									<p class="text-sm font-medium text-slate-800 dark:text-neutral-100">{$businessStore.companyName}</p>
									<p class="text-xs text-slate-500 dark:text-neutral-400">{$businessStore.branchName}</p>
								</div>
							</button>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<nav class="space-y-1 py-1">
			{#if sidebarCollapsed}
				{#each items as item}
					<a
						class="flex items-center justify-center rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-neutral-200 dark:hover:bg-neutral-900"
						href={item.href}
						title={item.label}
					>
						<span class="inline-flex h-5 w-5 items-center justify-center text-slate-500 dark:text-neutral-300">
							{#if item.icon === 'pedidos'}
							<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8">
								<path d="M7 4h10l3 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8l2-4z" />
								<path d="M3 8h18" />
							</svg>
						{:else if item.icon === 'clientes'}
							<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8">
								<circle cx="9" cy="8" r="3" />
								<path d="M3 19a6 6 0 0 1 12 0" />
								<path d="M17 11h4M19 9v4" />
							</svg>
						{:else if item.icon === 'equipo'}
							<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8">
								<circle cx="8" cy="8" r="3" />
								<circle cx="17" cy="9" r="2.5" />
								<path d="M2.5 19a5.5 5.5 0 0 1 11 0" />
								<path d="M14.5 19a4.5 4.5 0 0 1 7 0" />
							</svg>
						{:else if item.icon === 'productos'}
							<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8">
								<rect x="4" y="4" width="16" height="16" rx="2" />
								<path d="M4 10h16M10 4v16" />
							</svg>
						{:else if item.icon === 'categories'}
							<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8">
								<path d="M4 6h16M4 12h16M4 18h16" stroke-linecap="round" />
							</svg>
						{:else if item.icon === 'groups'}
							<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8">
								<path d="M4 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5zM14 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V5zM4 15a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4zM14 15a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-4z" />
							</svg>
						{:else if item.icon === 'config'}
							<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8">
								<circle cx="12" cy="12" r="3" />
								<path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55h.04a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" />
							</svg>
						{:else if item.icon === 'caja'}
							<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8">
								<rect x="3" y="5" width="18" height="14" rx="2" />
								<path d="M3 10h18M8 15h2" />
							</svg>
						{:else if item.icon === 'negocio'}
							<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8">
								<path d="M3 10l2-5h14l2 5" />
								<path d="M4 10v9h16v-9" />
								<path d="M9 19v-5h6v5" />
							</svg>
						{:else}
							<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8">
								<path d="M4 18V6M10 18V10M16 18V13M22 18V3" />
							</svg>
						{/if}
					</span>
				</a>
			{/each}
			{:else}
				{#each navGroups as group}
					<div class="space-y-1">
						<p class="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-neutral-500">
							{group.title}
						</p>
						{#each group.items as item}
							<a
								class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-neutral-200 dark:hover:bg-neutral-900"
								href={item.href}
								title={item.label}
							>
								<span class="inline-flex h-5 w-5 items-center justify-center text-slate-500 dark:text-neutral-300">
									{#if item.icon === 'pedidos'}
							<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8">
								<path d="M7 4h10l3 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8l2-4z" />
								<path d="M3 8h18" />
							</svg>
						{:else if item.icon === 'clientes'}
							<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8">
								<circle cx="9" cy="8" r="3" />
								<path d="M3 19a6 6 0 0 1 12 0" />
								<path d="M17 11h4M19 9v4" />
							</svg>
						{:else if item.icon === 'equipo'}
							<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8">
								<circle cx="8" cy="8" r="3" />
								<circle cx="17" cy="9" r="2.5" />
								<path d="M2.5 19a5.5 5.5 0 0 1 11 0" />
								<path d="M14.5 19a4.5 4.5 0 0 1 7 0" />
							</svg>
						{:else if item.icon === 'productos'}
							<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8">
								<rect x="4" y="4" width="16" height="16" rx="2" />
								<path d="M4 10h16M10 4v16" />
							</svg>
						{:else if item.icon === 'categories'}
							<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8">
								<path d="M4 6h16M4 12h16M4 18h16" stroke-linecap="round" />
							</svg>
						{:else if item.icon === 'groups'}
							<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8">
								<path d="M4 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5zM14 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V5zM4 15a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4zM14 15a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-4z" />
							</svg>
						{:else if item.icon === 'config'}
							<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8">
								<circle cx="12" cy="12" r="3" />
								<path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55h.04a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" />
							</svg>
						{:else if item.icon === 'caja'}
							<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8">
								<rect x="3" y="5" width="18" height="14" rx="2" />
								<path d="M3 10h18M8 15h2" />
							</svg>
						{:else if item.icon === 'negocio'}
							<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8">
								<path d="M3 10l2-5h14l2 5" />
								<path d="M4 10v9h16v-9" />
								<path d="M9 19v-5h6v5" />
							</svg>
						{:else}
							<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8">
								<path d="M4 18V6M10 18V10M16 18V13M22 18V3" />
							</svg>
						{/if}
								</span>
								<span>{item.label}</span>
							</a>
						{/each}
					</div>
				{/each}
			{/if}
		</nav>

		<div class="relative mt-auto border-t border-slate-200 pt-4 pb-1 dark:border-neutral-800">
			<button
				type="button"
				bind:this={avatarButtonRef}
				class="flex items-center text-left hover:bg-slate-100 dark:hover:bg-neutral-900"
				class:w-full={!sidebarCollapsed}
				class:rounded-lg={!sidebarCollapsed}
				class:px-2={!sidebarCollapsed}
				class:py-2={!sidebarCollapsed}
				class:h-12={sidebarCollapsed}
				class:w-12={sidebarCollapsed}
				class:mx-auto={sidebarCollapsed}
				class:rounded-full={sidebarCollapsed}
				class:justify-center={sidebarCollapsed}
				class:gap-3={!sidebarCollapsed}
				title={$sessionStore.user?.name ?? 'Usuario'}
				aria-haspopup="true"
				aria-expanded={avatarMenuOpen}
				onclick={(e) => {
					e.preventDefault();
					e.stopPropagation();
					avatarMenuOpen = !avatarMenuOpen;
				}}
			>
				{#if $sessionStore.user?.avatarUrl}
					<img
						src={$sessionStore.user.avatarUrl}
						alt={$sessionStore.user?.name ?? 'Usuario'}
						class="h-9 w-9 rounded-full object-cover"
					/>
				{:else}
					<div class="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white dark:bg-white dark:text-slate-900">
						{$sessionStore.user?.name?.trim()?.charAt(0)?.toUpperCase() ?? 'U'}
					</div>
				{/if}
				{#if !sidebarCollapsed}
					<div class="min-w-0">
						<p class="truncate text-sm font-medium text-slate-800 dark:text-neutral-100">
							{$sessionStore.user?.name ?? 'Usuario'}
						</p>
						<p class="truncate text-xs capitalize text-slate-500 dark:text-neutral-400">
							{$sessionStore.user?.role ? $sessionStore.user.role.charAt(0) + $sessionStore.user.role.slice(1).toLowerCase() : ''}
						</p>
					</div>
				{/if}
			</button>

			{#if avatarMenuOpen}
				<div
					data-avatar-dropdown
					class="fixed z-50 w-56 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-neutral-700 dark:bg-black"
					style="bottom: {avatarDropdownStyle.bottom}; left: {avatarDropdownStyle.left};"
				>
					<button
						class="block w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-neutral-200 dark:hover:bg-neutral-900"
						onclick={() => {
							void goProfile();
						}}
					>
						Mi perfil
					</button>
					{#if isTauri()}
						<div class="border-t border-slate-200 px-3 py-2 dark:border-neutral-700">
							<p class="text-xs font-medium text-slate-500 dark:text-neutral-400">
								Versión {$updateStore.appVersion || '…'}
							</p>
							<p class="mt-0.5 text-xs text-slate-500 dark:text-neutral-500">
								{#if $updateStore.status === 'checking'}
									⏳ Buscando actualización...
								{:else if $updateStore.status === 'update-available' && $updateStore.updateInfo}
									⬇ Nueva versión {$updateStore.updateInfo.version} disponible
								{:else if $updateStore.status === 'updated'}
									✓ Actualizado
								{:else if $updateStore.status === 'error'}
									{$updateStore.errorMessage ?? 'Error'}
								{:else}
									—
								{/if}
							</p>
							<div class="mt-2 flex flex-col gap-1">
								<button
									class="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 dark:border-neutral-600 dark:bg-black dark:text-neutral-200 dark:hover:bg-neutral-900"
									disabled={$updateStore.status === 'checking'}
									onclick={() => {
										void updateStore.manualCheck();
									}}
								>
									Buscar actualizaciones
								</button>
								{#if $updateStore.status === 'update-available'}
									<button
										class="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700"
										onclick={() => {
											void updateStore.installUpdate();
										}}
									>
										Descargar e instalar
									</button>
								{/if}
							</div>
						</div>
					{:else}
						<a
							href={$desktopDownloadStore.url}
							target="_blank"
							rel="noopener noreferrer"
							class="block rounded-md px-3 py-2 text-left text-sm text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
						>
							{$desktopDownloadStore.loading ? 'Cargando…' : 'Descargar versión Desktop'}
						</a>
					{/if}
					<button
						class="block w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-neutral-200 dark:hover:bg-neutral-900"
						onclick={toggleTheme}
					>
						{#if $themeStore === 'dark'}Modo claro{:else}Modo oscuro{/if}
					</button>
					<button
						class="block w-full rounded-md px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
						onclick={() => {
							void logout();
						}}
					>
						Cerrar sesión
					</button>
				</div>
			{/if}
		</div>
		</div>
	</aside>

	<div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
		<header
			class="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-neutral-800 dark:bg-black md:px-6"
		>
			<button
				class="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 dark:text-neutral-200 dark:hover:bg-neutral-900"
				class:bg-slate-100={!sidebarCollapsed}
				class:dark:bg-neutral-900={!sidebarCollapsed}
				aria-label="Comprimir o expandir menú"
				title={sidebarCollapsed ? 'Expandir menú' : 'Comprimir menú'}
				onclick={() => (sidebarCollapsed = !sidebarCollapsed)}
			>
				<svg viewBox="0 0 20 20" class="h-5 w-5" fill="none">
					<rect x="2.5" y="3" width="15" height="14" rx="2" stroke="currentColor" stroke-width="1.5" />
					{#if !sidebarCollapsed}
						<rect x="3.25" y="3.75" width="4.25" height="12.5" rx="1" fill="currentColor" opacity="0.35" />
					{/if}
					<path d="M8 3.5V16.5" stroke="currentColor" stroke-width="1.5" />
				</svg>
			</button>
			<div class="flex items-center gap-2">
				{#if isTauri()}
					<span
						class="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400"
						title="Versión de la app"
					>
						{#if $updateStore.status === 'update-available'}
							<span class="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true"></span>
						{/if}
						v{$updateStore.appVersion || '…'}
					</span>
				{:else}
					<a
						href={$desktopDownloadStore.url}
						target="_blank"
						rel="noopener noreferrer"
						class="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
					>
						{$desktopDownloadStore.loading ? '…' : 'Descargar Desktop'}
					</a>
				{/if}
			{#if $page.url.pathname !== '/app/create_order'}
				<a
					class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-50 dark:border-neutral-600 dark:bg-black dark:text-neutral-200 dark:hover:bg-neutral-900"
					href="/app/create_order"
					aria-label="POS - Crear pedido"
					title="POS - Crear pedido"
				>
					<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<path d="M3 10l2-5h14l2 5" />
						<path d="M4 10v9h16v-9" />
						<path d="M9 19v-5h6v5" />
					</svg>
				</a>
				<a
					class="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-lg font-semibold text-white transition hover:bg-black dark:bg-white dark:text-black dark:hover:bg-neutral-200"
					href="/app/create_order?openClientModal=1"
					aria-label="Crear pedido"
					title="Crear pedido"
				>
					<span aria-hidden="true">+</span>
				</a>
			{/if}
			</div>
		</header>

		<main class="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">{@render children()}</main>
	</div>
</div>
{/if}

<ToastHost />
