<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import ThemeSwitcher from '$lib/components/ThemeSwitcher.svelte';
	import { supabase } from '$lib/supabase/client';
	import { sessionStore } from '$lib/stores/session';
	import { toastsStore } from '$lib/stores/toasts';
	import { onMount } from 'svelte';

	let mode: 'login' | 'register' | 'forgot' = 'login';
	let fullName = '';
	let email = '';
	let password = '';
	let loading = false;
	let showPassword = false;

	const onSubmit = async () => {
		loading = true;
		if (mode === 'forgot') {
			const redirectTo = browser ? `${window.location.origin}/login` : undefined;
			const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
			loading = false;
			if (error) {
				toastsStore.error(error.message ?? 'No se pudo enviar el correo de recuperación');
				return;
			}
			toastsStore.success('Te enviamos un correo para recuperar la contraseña');
			mode = 'login';
			return;
		}

		if (mode === 'login') {
			const result = await sessionStore.login(email, password);
			loading = false;
			if (!result.ok) {
				toastsStore.error(result.message ?? 'No se pudo iniciar sesión');
				return;
			}
			toastsStore.success('Sesión iniciada');
			await goto('/app');
			return;
		}

		const result = await sessionStore.register(email, password, fullName);
		loading = false;
		if (!result.ok) {
			toastsStore.error(result.message ?? 'No se pudo registrar');
			return;
		}
		if (result.needsEmailConfirmation) {
			toastsStore.info('Registro creado. Te llegará un email de Supabase para verificar tu cuenta.');
			mode = 'login';
			return;
		}
		toastsStore.success('Cuenta creada y sesión iniciada');
		await goto('/app');
	};

	onMount(() => {
		void (async () => {
			await sessionStore.hydrate();
			if ($sessionStore.user) {
				await goto('/app');
			}
		})();
	});
</script>

<svelte:head>
	<title>Novum | Acceso</title>
</svelte:head>

<main class="relative flex min-h-screen w-full items-center justify-center overflow-hidden p-6 pb-24">
	<div
		class="absolute inset-0 bg-cover bg-center bg-no-repeat"
		style="background-image: url('https://images.pexels.com/photos/12935069/pexels-photo-12935069.jpeg?_gl=1*1plooks*_ga*NjAxMjI1NTE5LjE3NzEyNTgyODY.*_ga_8JE65Q40S6*czE3NzEyNTgyODUkbzEkZzEkdDE3NzEyNTg2NDAkajYkbDAkaDA.');"
	></div>
	<div class="absolute inset-0 bg-black/35"></div>
	<section
		class="relative z-10 w-full max-w-md rounded-3xl border border-white/45 bg-white/55 p-7 shadow-2xl backdrop-blur-md dark:border-white/20 dark:bg-black/35"
	>
		<div class="flex justify-center">
			<svg width="132" height="20" viewBox="0 0 351 53" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" class="text-slate-900 dark:text-white">
				<path d="M322.217 52.7832H309.521V17.7734C309.521 16.1133 309.082 14.86 308.203 14.0137C307.324 13.1348 306.022 12.6953 304.297 12.6953H287.793V52.7832H275.098V6.29883C275.098 5.41992 275.26 4.60612 275.586 3.85742C275.911 3.07617 276.367 2.40885 276.953 1.85547C277.539 1.26953 278.223 0.813802 279.004 0.488281C279.785 0.16276 280.615 0 281.494 0H304.395C306.152 0 308.04 0.309245 310.059 0.927734C312.077 1.54622 313.997 2.53906 315.82 3.90625V0H333.008C334.212 0 335.482 0.146484 336.816 0.439453C338.151 0.69987 339.469 1.12305 340.771 1.70898C342.106 2.29492 343.376 3.0599 344.58 4.00391C345.785 4.91536 346.842 6.03841 347.754 7.37305C348.665 8.67513 349.398 10.1888 349.951 11.9141C350.505 13.6393 350.781 15.5924 350.781 17.7734V52.7832H338.086V17.7734C338.086 16.1133 337.663 14.86 336.816 14.0137C336.003 13.1348 334.733 12.6953 333.008 12.6953H321.582C322.005 14.2578 322.217 15.9505 322.217 17.7734V52.7832Z" fill="currentColor"/>
				<path d="M263.184 46.3867C263.184 47.2982 263.021 48.1445 262.695 48.9258C262.37 49.707 261.914 50.3906 261.328 50.9766C260.775 51.5299 260.107 51.9694 259.326 52.2949C258.577 52.6204 257.764 52.7832 256.885 52.7832H228.174C226.611 52.7832 224.935 52.6042 223.145 52.2461C221.387 51.888 219.645 51.3184 217.92 50.5371C216.195 49.7233 214.518 48.7142 212.891 47.5098C211.296 46.2728 209.896 44.7917 208.691 43.0664C207.487 41.3086 206.51 39.2904 205.762 37.0117C205.046 34.7331 204.688 32.1615 204.688 29.2969V0H217.383V29.2969C217.383 30.957 217.66 32.4544 218.213 33.7891C218.799 35.0911 219.58 36.2142 220.557 37.1582C221.533 38.1022 222.673 38.8346 223.975 39.3555C225.309 39.8438 226.742 40.0879 228.271 40.0879H250.488V0H263.184V46.3867Z" fill="currentColor"/>
				<path d="M200.879 0C199.447 4.45964 197.77 8.85417 195.85 13.1836C193.929 17.513 191.715 21.6471 189.209 25.5859C186.735 29.4922 183.952 33.1217 180.859 36.4746C177.799 39.7949 174.398 42.6758 170.654 45.1172C166.943 47.526 162.891 49.4303 158.496 50.8301C154.134 52.1973 149.398 52.8809 144.287 52.8809C143.408 52.8809 142.578 52.7181 141.797 52.3926C141.016 52.0671 140.332 51.6276 139.746 51.0742C139.16 50.4883 138.704 49.821 138.379 49.0723C138.053 48.291 137.891 47.4609 137.891 46.582V0H150.586V39.6973C153.678 39.6973 156.641 39.0299 159.473 37.6953C162.337 36.3607 165.039 34.6029 167.578 32.4219C170.117 30.2083 172.461 27.7018 174.609 24.9023C176.79 22.1029 178.727 19.2383 180.42 16.3086C182.113 13.3464 183.545 10.4492 184.717 7.61719C185.921 4.78516 186.816 2.24609 187.402 0H200.879Z" fill="currentColor"/>
				<path d="M127.051 34.9609C127.051 37.1419 126.774 39.1113 126.221 40.8691C125.667 42.5944 124.935 44.1243 124.023 45.459C123.112 46.7611 122.054 47.8841 120.85 48.8281C119.645 49.7396 118.376 50.4883 117.041 51.0742C115.739 51.6602 114.404 52.0996 113.037 52.3926C111.702 52.653 110.433 52.7832 109.229 52.7832H86.3281C84.5703 52.7832 82.6497 52.474 80.5664 51.8555C78.4831 51.237 76.5462 50.2279 74.7559 48.8281C72.998 47.3958 71.5169 45.5566 70.3125 43.3105C69.1406 41.0319 68.5547 38.2487 68.5547 34.9609V17.7734C68.5547 14.5182 69.1406 11.7676 70.3125 9.52148C71.5169 7.24284 72.998 5.40365 74.7559 4.00391C76.5462 2.57161 78.4831 1.54622 80.5664 0.927734C82.6497 0.309245 84.5703 0 86.3281 0H109.229C112.484 0 115.251 0.585938 117.529 1.75781C119.808 2.92969 121.647 4.41081 123.047 6.20117C124.447 7.95898 125.456 9.87956 126.074 11.9629C126.725 14.0462 127.051 15.9831 127.051 17.7734V34.9609ZM114.355 17.8711C114.355 16.1133 113.916 14.8112 113.037 13.9648C112.158 13.1185 110.889 12.6953 109.229 12.6953H86.4258C84.7331 12.6953 83.4473 13.1348 82.5684 14.0137C81.6895 14.86 81.25 16.1133 81.25 17.7734V34.9609C81.25 36.6211 81.6895 37.8906 82.5684 38.7695C83.4473 39.6484 84.7331 40.0879 86.4258 40.0879H109.229C110.954 40.0879 112.24 39.6484 113.086 38.7695C113.932 37.8906 114.355 36.6211 114.355 34.9609V17.8711Z" fill="currentColor"/>
				<path d="M58.4961 52.7832H45.8008V23.4863C45.8008 21.8262 45.5078 20.3451 44.9219 19.043C44.3685 17.7083 43.6035 16.569 42.627 15.625C41.6504 14.681 40.4948 13.9648 39.1602 13.4766C37.8581 12.9557 36.4421 12.6953 34.9121 12.6953H12.6953V52.7832H0V6.29883C0 5.41992 0.16276 4.60612 0.488281 3.85742C0.813802 3.07617 1.26953 2.40885 1.85547 1.85547C2.44141 1.26953 3.125 0.813802 3.90625 0.488281C4.6875 0.16276 5.51758 0 6.39648 0H35.0098C36.6048 0 38.2812 0.179036 40.0391 0.537109C41.8294 0.895182 43.5872 1.48112 45.3125 2.29492C47.0703 3.07617 48.7305 4.08529 50.293 5.32227C51.888 6.52669 53.2878 8.00781 54.4922 9.76562C55.7292 11.4909 56.7057 13.4928 57.4219 15.7715C58.138 18.0501 58.4961 20.6217 58.4961 23.4863V52.7832Z" fill="currentColor"/>
			</svg>
		</div>
		<h1 class="mt-5 text-center text-2xl font-semibold text-slate-950 dark:text-slate-100">
			{mode === 'register' ? 'Crea tu cuenta' : mode === 'forgot' ? 'Recuperar contraseña' : 'Bienvenido de nuevo'}
		</h1>
		<p class="mt-2 text-center text-sm text-slate-700 dark:text-slate-300/85">
			{mode === 'register'
				? 'Completá tus datos para registrarte en Novum.'
				: mode === 'forgot'
					? 'Ingresá tu correo y te enviaremos un enlace para restablecer tu clave.'
					: 'Ingresa tus credenciales para acceder a tu cuenta.'}
		</p>

		<form
			class="mt-8 space-y-4"
			onsubmit={(e) => {
				e.preventDefault();
				void onSubmit();
			}}
		>
			{#if mode === 'register'}
				<label class="block space-y-1">
					<span class="text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 dark:text-slate-200/90"
						>Nombre completo</span
					>
					<input
						class="w-full rounded-2xl border border-slate-300/80 bg-white/85 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-700 focus:ring-2 focus:ring-slate-300/60 dark:border-white/20 dark:bg-black/20 dark:text-slate-100 dark:focus:border-slate-200 dark:focus:ring-slate-700/60"
						bind:value={fullName}
						minlength={2}
						required
					/>
				</label>
			{/if}

			<label class="block space-y-1">
				<span class="text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 dark:text-slate-200/90"
					>Correo electronico</span
				>
				<input
					class="w-full rounded-2xl border border-slate-300/80 bg-white/85 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-700 focus:ring-2 focus:ring-slate-300/60 dark:border-white/20 dark:bg-black/20 dark:text-slate-100 dark:focus:border-slate-200 dark:focus:ring-slate-700/60"
					type="email"
					bind:value={email}
					required
				/>
			</label>

			{#if mode !== 'forgot'}
				<label class="block space-y-1">
					<span class="text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 dark:text-slate-200/90"
						>Contrasena</span
					>
					<div class="relative">
						<input
							class="w-full rounded-2xl border border-slate-300/80 bg-white/85 px-4 py-3 pr-20 text-sm text-slate-900 outline-none transition focus:border-slate-700 focus:ring-2 focus:ring-slate-300/60 dark:border-white/20 dark:bg-black/20 dark:text-slate-100 dark:focus:border-slate-200 dark:focus:ring-slate-700/60"
							type={showPassword ? 'text' : 'password'}
							bind:value={password}
							minlength={6}
							required
						/>
						<button
							type="button"
							class="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-700 transition hover:bg-slate-200/70 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
							onclick={() => (showPassword = !showPassword)}
							aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
						>
							{#if showPassword}
								<svg
									class="h-5 w-5"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="1.8"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									<path d="M3 3L21 21" />
									<path d="M10.6 10.6A2 2 0 0 0 12 14a2 2 0 0 0 1.4-.6" />
									<path d="M9.3 5.1A10.2 10.2 0 0 1 12 4c5.5 0 9.2 4.8 10 8-0.4 1.6-1.5 3.7-3.3 5.3" />
									<path d="M6.2 6.2C4.2 7.8 3 10.1 2 12c0.9 3.2 4.5 8 10 8 1.7 0 3.2-0.4 4.5-1.1" />
								</svg>
							{:else}
								<svg
									class="h-5 w-5"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="1.8"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									<path d="M2 12C2.9 8.8 6.5 4 12 4s9.1 4.8 10 8c-0.9 3.2-4.5 8-10 8S2.9 15.2 2 12Z" />
									<circle cx="12" cy="12" r="3" />
								</svg>
							{/if}
						</button>
					</div>
				</label>
			{/if}

			{#if mode === 'login'}
				<div class="flex justify-end">
					<button
						type="button"
						class="text-xs font-medium text-slate-700 transition hover:text-slate-950 dark:text-slate-200 dark:hover:text-white"
						onclick={() => {
							mode = 'forgot';
							showPassword = false;
						}}
					>
						¿Olvidaste tu contrasena?
					</button>
				</div>
			{/if}

			{#if mode === 'register'}
				<p class="text-xs text-slate-700 dark:text-slate-300/80">
					Al registrarte, Supabase enviará un email para verificar tu cuenta antes de ingresar.
				</p>
			{/if}

			<button
				class="mt-2 inline-flex w-full items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-base font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
				type="submit"
				disabled={loading}
			>
				{mode === 'login' ? 'Iniciar sesion' : mode === 'register' ? 'Crear cuenta' : 'Enviar enlace'}
			</button>
		</form>

		<div class="mt-6 border-t border-slate-300/40 pt-5 text-center">
			{#if mode === 'login'}
				<p class="text-sm text-slate-700 dark:text-slate-200/90">
					¿No tienes una cuenta?
					<button
						type="button"
						class="ml-1 font-semibold text-slate-950 underline decoration-transparent underline-offset-2 transition hover:decoration-current dark:text-white"
						onclick={() => {
							mode = 'register';
							showPassword = false;
						}}
					>
						Registrarse
					</button>
				</p>
			{:else if mode === 'register'}
				<p class="text-sm text-slate-700 dark:text-slate-200/90">
					¿Ya tienes una cuenta?
					<button
						type="button"
						class="ml-1 font-semibold text-slate-950 underline decoration-transparent underline-offset-2 transition hover:decoration-current dark:text-white"
						onclick={() => {
							mode = 'login';
							showPassword = false;
						}}
					>
						Iniciar sesion
					</button>
				</p>
			{:else}
				<p class="text-sm text-slate-700 dark:text-slate-200/90">
					Recordaste tu clave?
					<button
						type="button"
						class="ml-1 font-semibold text-slate-950 underline decoration-transparent underline-offset-2 transition hover:decoration-current dark:text-white"
						onclick={() => {
							mode = 'login';
							showPassword = false;
						}}
					>
						Volver a iniciar sesion
					</button>
				</p>
			{/if}
		</div>

	</section>

	<footer class="absolute bottom-5 left-1/2 z-10 -translate-x-1/2 text-center text-xs font-medium text-slate-200/90">
		<div class="mb-3 flex justify-center">
			<ThemeSwitcher />
		</div>
		<p>
			&copy; 2026 Novum. Todos los derechos reservados. Creado con &#10084; Allianzy Inc.
		</p>
	</footer>
</main>
