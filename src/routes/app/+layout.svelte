<script lang="ts">
	import { goto } from '$app/navigation';
	import ToastHost from '$lib/components/ToastHost.svelte';
	import { businessStore } from '$lib/stores/business';
	import { sessionStore } from '$lib/stores/session';
	import { themeStore } from '$lib/stores/theme';
	import { onMount } from 'svelte';

	let { children } = $props();
	let sidebarCollapsed = $state(false);
	let avatarMenuOpen = $state(false);
	let businessMenuOpen = $state(false);
	let now = $state(new Date());

	const formatHeaderDateTime = (date: Date) => {
		const weekdays = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
		const months = [
			'Enero',
			'Febrero',
			'Marzo',
			'Abril',
			'Mayo',
			'Junio',
			'Julio',
			'Agosto',
			'Septiembre',
			'Octubre',
			'Noviembre',
			'Diciembre'
		];
		const weekday = weekdays[date.getDay()];
		const day = String(date.getDate()).padStart(2, '0');
		const month = months[date.getMonth()];
		const year = date.getFullYear();
		const hh = String(date.getHours()).padStart(2, '0');
		const mm = String(date.getMinutes()).padStart(2, '0');
		const ss = String(date.getSeconds()).padStart(2, '0');
		return `${weekday} ${day} de ${month} de ${year}, ${hh}:${mm}:${ss}.`;
	};

	const goProfile = async () => {
		avatarMenuOpen = false;
		await goto('/app/perfil');
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

	const items = [
		{ href: '/app/pedidos', label: 'Pedidos', icon: 'pedidos' },
		{ href: '/app/clientes', label: 'Clientes', icon: 'clientes' },
		{ href: '/app/equipo', label: 'Equipo', icon: 'equipo' },
		{ href: '/app/productos', label: 'Productos', icon: 'productos' },
		{ href: '/app/categories', label: 'Categorías', icon: 'categories' },
		{ href: '/app/groups', label: 'Grupos', icon: 'groups' },
		{ href: '/app/negocio', label: 'Negocio', icon: 'negocio' }
	];

	onMount(() => {
		void (async () => {
			await Promise.all([sessionStore.hydrate(), businessStore.load()]);
			if (!$sessionStore.user) {
				await goto('/login');
			}
		})();

		const timer = setInterval(() => {
			now = new Date();
		}, 1000);

		return () => clearInterval(timer);
	});

</script>

<div class="flex min-h-screen bg-slate-100 dark:bg-slate-950">
	<aside
		class="flex flex-col border-r border-slate-200 bg-white transition-all dark:border-slate-700 dark:bg-slate-900"
		class:w-64={!sidebarCollapsed}
		class:w-20={sidebarCollapsed}
	>
		<div class="flex h-14 items-center border-b border-slate-200 px-4 dark:border-slate-700">
			<div class="flex w-full items-center" class:justify-start={!sidebarCollapsed} class:justify-center={sidebarCollapsed}>
				<div class="inline-flex items-center justify-center text-slate-900 dark:text-white" title="Grido Delivery">
					{#if sidebarCollapsed}
						<svg width="20" height="18" viewBox="0 0 59 53" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
							<path d="M58.4961 52.7832H45.8008V23.4863C45.8008 21.8262 45.5078 20.3451 44.9219 19.043C44.3685 17.7083 43.6035 16.569 42.627 15.625C41.6504 14.681 40.4948 13.9648 39.1602 13.4766C37.8581 12.9557 36.4421 12.6953 34.9121 12.6953H12.6953V52.7832H0V6.29883C0 5.41992 0.16276 4.60612 0.488281 3.85742C0.813802 3.07617 1.26953 2.40885 1.85547 1.85547C2.44141 1.26953 3.125 0.813802 3.90625 0.488281C4.6875 0.16276 5.51758 0 6.39648 0H35.0098C36.6048 0 38.2812 0.179036 40.0391 0.537109C41.8294 0.895182 43.5872 1.48112 45.3125 2.29492C47.0703 3.07617 48.7305 4.08529 50.293 5.32227C51.888 6.52669 53.2878 8.00781 54.4922 9.76562C55.7292 11.4909 56.7057 13.4928 57.4219 15.7715C58.138 18.0501 58.4961 20.6217 58.4961 23.4863V52.7832Z" fill="currentColor"/>
						</svg>
					{:else}
						<svg width="132" height="20" viewBox="0 0 351 53" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
							<path d="M322.217 52.7832H309.521V17.7734C309.521 16.1133 309.082 14.86 308.203 14.0137C307.324 13.1348 306.022 12.6953 304.297 12.6953H287.793V52.7832H275.098V6.29883C275.098 5.41992 275.26 4.60612 275.586 3.85742C275.911 3.07617 276.367 2.40885 276.953 1.85547C277.539 1.26953 278.223 0.813802 279.004 0.488281C279.785 0.16276 280.615 0 281.494 0H304.395C306.152 0 308.04 0.309245 310.059 0.927734C312.077 1.54622 313.997 2.53906 315.82 3.90625V0H333.008C334.212 0 335.482 0.146484 336.816 0.439453C338.151 0.69987 339.469 1.12305 340.771 1.70898C342.106 2.29492 343.376 3.0599 344.58 4.00391C345.785 4.91536 346.842 6.03841 347.754 7.37305C348.665 8.67513 349.398 10.1888 349.951 11.9141C350.505 13.6393 350.781 15.5924 350.781 17.7734V52.7832H338.086V17.7734C338.086 16.1133 337.663 14.86 336.816 14.0137C336.003 13.1348 334.733 12.6953 333.008 12.6953H321.582C322.005 14.2578 322.217 15.9505 322.217 17.7734V52.7832Z" fill="currentColor"/>
							<path d="M263.184 46.3867C263.184 47.2982 263.021 48.1445 262.695 48.9258C262.37 49.707 261.914 50.3906 261.328 50.9766C260.775 51.5299 260.107 51.9694 259.326 52.2949C258.577 52.6204 257.764 52.7832 256.885 52.7832H228.174C226.611 52.7832 224.935 52.6042 223.145 52.2461C221.387 51.888 219.645 51.3184 217.92 50.5371C216.195 49.7233 214.518 48.7142 212.891 47.5098C211.296 46.2728 209.896 44.7917 208.691 43.0664C207.487 41.3086 206.51 39.2904 205.762 37.0117C205.046 34.7331 204.688 32.1615 204.688 29.2969V0H217.383V29.2969C217.383 30.957 217.66 32.4544 218.213 33.7891C218.799 35.0911 219.58 36.2142 220.557 37.1582C221.533 38.1022 222.673 38.8346 223.975 39.3555C225.309 39.8438 226.742 40.0879 228.271 40.0879H250.488V0H263.184V46.3867Z" fill="currentColor"/>
							<path d="M200.879 0C199.447 4.45964 197.77 8.85417 195.85 13.1836C193.929 17.513 191.715 21.6471 189.209 25.5859C186.735 29.4922 183.952 33.1217 180.859 36.4746C177.799 39.7949 174.398 42.6758 170.654 45.1172C166.943 47.526 162.891 49.4303 158.496 50.8301C154.134 52.1973 149.398 52.8809 144.287 52.8809C143.408 52.8809 142.578 52.7181 141.797 52.3926C141.016 52.0671 140.332 51.6276 139.746 51.0742C139.16 50.4883 138.704 49.821 138.379 49.0723C138.053 48.291 137.891 47.4609 137.891 46.582V0H150.586V39.6973C153.678 39.6973 156.641 39.0299 159.473 37.6953C162.337 36.3607 165.039 34.6029 167.578 32.4219C170.117 30.2083 172.461 27.7018 174.609 24.9023C176.79 22.1029 178.727 19.2383 180.42 16.3086C182.113 13.3464 183.545 10.4492 184.717 7.61719C185.921 4.78516 186.816 2.24609 187.402 0H200.879Z" fill="currentColor"/>
							<path d="M127.051 34.9609C127.051 37.1419 126.774 39.1113 126.221 40.8691C125.667 42.5944 124.935 44.1243 124.023 45.459C123.112 46.7611 122.054 47.8841 120.85 48.8281C119.645 49.7396 118.376 50.4883 117.041 51.0742C115.739 51.6602 114.404 52.0996 113.037 52.3926C111.702 52.653 110.433 52.7832 109.229 52.7832H86.3281C84.5703 52.7832 82.6497 52.474 80.5664 51.8555C78.4831 51.237 76.5462 50.2279 74.7559 48.8281C72.998 47.3958 71.5169 45.5566 70.3125 43.3105C69.1406 41.0319 68.5547 38.2487 68.5547 34.9609V17.7734C68.5547 14.5182 69.1406 11.7676 70.3125 9.52148C71.5169 7.24284 72.998 5.40365 74.7559 4.00391C76.5462 2.57161 78.4831 1.54622 80.5664 0.927734C82.6497 0.309245 84.5703 0 86.3281 0H109.229C112.484 0 115.251 0.585938 117.529 1.75781C119.808 2.92969 121.647 4.41081 123.047 6.20117C124.447 7.95898 125.456 9.87956 126.074 11.9629C126.725 14.0462 127.051 15.9831 127.051 17.7734V34.9609ZM114.355 17.8711C114.355 16.1133 113.916 14.8112 113.037 13.9648C112.158 13.1185 110.889 12.6953 109.229 12.6953H86.4258C84.7331 12.6953 83.4473 13.1348 82.5684 14.0137C81.6895 14.86 81.25 16.1133 81.25 17.7734V34.9609C81.25 36.6211 81.6895 37.8906 82.5684 38.7695C83.4473 39.6484 84.7331 40.0879 86.4258 40.0879H109.229C110.954 40.0879 112.24 39.6484 113.086 38.7695C113.932 37.8906 114.355 36.6211 114.355 34.9609V17.8711Z" fill="currentColor"/>
							<path d="M58.4961 52.7832H45.8008V23.4863C45.8008 21.8262 45.5078 20.3451 44.9219 19.043C44.3685 17.7083 43.6035 16.569 42.627 15.625C41.6504 14.681 40.4948 13.9648 39.1602 13.4766C37.8581 12.9557 36.4421 12.6953 34.9121 12.6953H12.6953V52.7832H0V6.29883C0 5.41992 0.16276 4.60612 0.488281 3.85742C0.813802 3.07617 1.26953 2.40885 1.85547 1.85547C2.44141 1.26953 3.125 0.813802 3.90625 0.488281C4.6875 0.16276 5.51758 0 6.39648 0H35.0098C36.6048 0 38.2812 0.179036 40.0391 0.537109C41.8294 0.895182 43.5872 1.48112 45.3125 2.29492C47.0703 3.07617 48.7305 4.08529 50.293 5.32227C51.888 6.52669 53.2878 8.00781 54.4922 9.76562C55.7292 11.4909 56.7057 13.4928 57.4219 15.7715C58.138 18.0501 58.4961 20.6217 58.4961 23.4863V52.7832Z" fill="currentColor"/>
						</svg>
					{/if}
				</div>
			</div>
		</div>

		<div class="flex min-h-0 flex-1 flex-col p-4">
		<div class="mb-4">
			{#if sidebarCollapsed}
				<div class="relative flex justify-center">
					<button
						class="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
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
						class="flex w-full items-center gap-2 rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-left shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800"
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
							<p class="truncate text-base font-semibold leading-5 text-slate-900 dark:text-slate-100">
								{$businessStore.companyName}
							</p>
							<p class="truncate text-xs leading-4 text-slate-500 dark:text-slate-400">{$businessStore.branchName}</p>
						</div>
						<svg
							viewBox="0 0 20 20"
							class="h-4 w-4 text-slate-500 transition-transform dark:text-slate-400"
							class:rotate-180={businessMenuOpen}
							fill="none"
						>
							<path d="M5 7.5l5 5 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
						</svg>
					</button>

					{#if businessMenuOpen}
						<div class="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
							<button
								class="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
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
									<p class="text-sm font-medium text-slate-800 dark:text-slate-100">{$businessStore.companyName}</p>
									<p class="text-xs text-slate-500 dark:text-slate-400">{$businessStore.branchName}</p>
								</div>
							</button>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<nav class="space-y-1">
			{#each items as item}
				<a
					class="flex items-center rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
					class:justify-center={sidebarCollapsed}
					class:gap-3={!sidebarCollapsed}
					href={item.href}
					title={item.label}
				>
					<span class="inline-flex h-5 w-5 items-center justify-center text-slate-500 dark:text-slate-300">
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
					{#if !sidebarCollapsed}
						<span>{item.label}</span>
					{/if}
				</a>
			{/each}
		</nav>

		<div class="relative mt-auto border-t border-slate-200 pt-3 dark:border-slate-700">
			<button
				class="flex items-center text-left hover:bg-slate-100 dark:hover:bg-slate-800"
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
				onclick={() => (avatarMenuOpen = !avatarMenuOpen)}
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
						<p class="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
							{$sessionStore.user?.name ?? 'Usuario'}
						</p>
						<p class="truncate text-xs text-slate-500 dark:text-slate-400">
							{$sessionStore.user?.email ?? ''}
						</p>
					</div>
				{/if}
			</button>

			{#if avatarMenuOpen}
				<div
					class="absolute z-30 w-56 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
					class:bottom-14={!sidebarCollapsed}
					class:left-0={!sidebarCollapsed}
					class:bottom-0={sidebarCollapsed}
					class:left-[4.25rem]={sidebarCollapsed}
				>
					<button
						class="block w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
						onclick={() => {
							void goProfile();
						}}
					>
						Mi perfil
					</button>
					<button
						class="block w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
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

	<div class="flex min-w-0 flex-1 flex-col">
		<header
			class="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-slate-700 dark:bg-slate-900 md:px-6"
		>
			<div class="flex items-center gap-2">
				<button
					class="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
					class:bg-slate-100={!sidebarCollapsed}
					class:dark:bg-slate-800={!sidebarCollapsed}
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
				<a
					class="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-lg font-semibold text-white transition hover:bg-black dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
					href="/app/nuevo-pedido"
					aria-label="Nuevo pedido"
					title="Nuevo pedido"
				>
					+
				</a>
			</div>
			<div class="text-sm font-medium text-slate-700 dark:text-slate-200">
				{formatHeaderDateTime(now)}
			</div>
		</header>

		<main class="min-h-0 flex-1 p-4 md:p-6">{@render children()}</main>
	</div>
</div>

<ToastHost />
