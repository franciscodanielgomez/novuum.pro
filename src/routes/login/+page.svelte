<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import LogoNovuum from '$lib/components/LogoNovuum.svelte';
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
	<title>Novuum | Acceso</title>
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
			<LogoNovuum width={180} />
		</div>
		<h1 class="mt-5 text-center text-2xl font-semibold text-slate-950 dark:text-slate-100">
			{mode === 'register' ? 'Crea tu cuenta' : mode === 'forgot' ? 'Recuperar contraseña' : 'Bienvenido de nuevo'}
		</h1>
		<p class="mt-2 text-center text-sm text-slate-700 dark:text-slate-300/85">
			{mode === 'register'
				? 'Completá tus datos para registrarte en Novuum.'
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
			&copy; 2026 Novuum. Todos los derechos reservados. Creado con &#10084; Allianzy Inc.
		</p>
	</footer>
</main>
