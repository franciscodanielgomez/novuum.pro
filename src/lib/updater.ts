/**
 * Auto-updater solo en Desktop (Tauri). No se importa nada de Tauri para no romper la web.
 */

import { browser } from '$app/environment';

function getInvoke(): ((cmd: string, args?: { payload?: unknown }) => Promise<unknown>) | null {
	if (!browser || typeof window === 'undefined') return null;
	const t = (window as unknown as { __TAURI__?: { core?: { invoke: (c: string, a?: unknown) => Promise<unknown> } } }).__TAURI__;
	return t?.core?.invoke ?? null;
}

export function isUpdaterAvailable(): boolean {
	return getInvoke() !== null;
}

export type UpdateInfo = {
	version: string;
	date: string | null;
	body: string | null;
};

/** Versión instalada (solo Tauri). */
export async function getAppVersion(): Promise<string | null> {
	const invoke = getInvoke();
	if (!invoke) return null;
	try {
		return (await invoke('get_app_version')) as string;
	} catch {
		return null;
	}
}

/** Buscar actualizaciones (solo Tauri). */
export async function checkUpdate(): Promise<UpdateInfo | null> {
	const invoke = getInvoke();
	if (!invoke) return null;
	const out = (await invoke('check_update')) as UpdateInfo | null;
	return out ?? null;
}

/** Descargar e instalar la actualización encontrada (solo Tauri). Tras instalar la app se cierra/reinicia. */
export async function downloadAndInstallUpdate(): Promise<void> {
	const invoke = getInvoke();
	if (!invoke) throw new Error('Actualizador no disponible');
	await invoke('download_and_install_update');
}
