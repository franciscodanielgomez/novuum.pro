/**
 * Estado y lógica del auto-update (solo Desktop).
 * En Web no se ejecuta chequeo; la UI usa isTauri() para mostrar "Descargar Desktop".
 */

import { writable } from 'svelte/store';
import { isTauri } from '$lib/printing/printer';
import {
	getAppVersion,
	checkUpdate,
	downloadAndInstallUpdate,
	type UpdateInfo
} from '$lib/updater';

export type UpdateStatus = 'idle' | 'checking' | 'updated' | 'update-available' | 'error';

type UpdateState = {
	appVersion: string;
	status: UpdateStatus;
	updateInfo: UpdateInfo | null;
	lastCheckAt: string | null;
	errorMessage: string | null;
};

const initialState: UpdateState = {
	appVersion: '',
	status: 'idle',
	updateInfo: null,
	lastCheckAt: null,
	errorMessage: null
};

const { subscribe, set, update } = writable<UpdateState>(initialState);

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 horas
let periodicTimer: ReturnType<typeof setInterval> | null = null;

async function doCheck(): Promise<void> {
	if (!isTauri()) return;
	update((s) => ({ ...s, status: 'checking', errorMessage: null }));
	try {
		const result = await checkUpdate();
		const now = new Date().toLocaleString('es-AR');
		if (result) {
			update((s) => ({
				...s,
				status: 'update-available',
				updateInfo: result,
				lastCheckAt: now,
				errorMessage: null
			}));
		} else {
			update((s) => ({
				...s,
				status: 'updated',
				updateInfo: null,
				lastCheckAt: now,
				errorMessage: null
			}));
		}
	} catch (e) {
		update((s) => ({
			...s,
			status: 'error',
			errorMessage: e instanceof Error ? e.message : 'Error al buscar'
		}));
	}
}

/** Inicializa versión y primer chequeo en background (solo Desktop). */
export function initUpdateService(): void {
	if (!isTauri()) return;

	getAppVersion().then((v) => {
		if (v) update((s) => ({ ...s, appVersion: v }));
	});
	doCheck();
	periodicTimer = setInterval(doCheck, CHECK_INTERVAL_MS);
}

/** Chequeo manual (botón "Buscar actualizaciones"). */
export async function manualCheck(): Promise<void> {
	if (!isTauri()) return;
	await doCheck();
}

/** Descargar e instalar; en Windows la app se cierra. */
export async function installUpdate(): Promise<void> {
	if (!isTauri()) return;
	await downloadAndInstallUpdate();
}

export function stopPeriodicCheck(): void {
	if (periodicTimer) {
		clearInterval(periodicTimer);
		periodicTimer = null;
	}
}

export const updateStore = {
	subscribe,
	init: initUpdateService,
	manualCheck,
	installUpdate,
	stopPeriodicCheck
};
