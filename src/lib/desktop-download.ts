/**
 * URL para que los usuarios en Web descarguen la versión Desktop.
 * Si está definido VITE_GITHUB_REPO (ej. "owner/repo"), se obtiene el enlace
 * directo al .msi de la última release desde la API de GitHub.
 * Fallback: VITE_DESKTOP_DOWNLOAD_URL o la página releases/latest.
 */

import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const env = typeof import.meta !== 'undefined' ? (import.meta as { env?: Record<string, string> }).env : undefined;

/** Repo en formato "owner/repo" para la API de GitHub. En .env: VITE_GITHUB_REPO=owner/repo */
export const GITHUB_REPO = env?.VITE_GITHUB_REPO?.trim() || '';

/** URL estática de respaldo (página del release o enlace directo). En .env: VITE_DESKTOP_DOWNLOAD_URL */
export const DESKTOP_DOWNLOAD_URL_FALLBACK =
	(env?.VITE_DESKTOP_DOWNLOAD_URL?.trim() && env.VITE_DESKTOP_DOWNLOAD_URL) ||
	(GITHUB_REPO ? `https://github.com/${GITHUB_REPO}/releases/latest` : 'https://github.com/TU_USUARIO/TU_REPO/releases/latest');

/** Para compatibilidad: mismo valor que el fallback hasta que se resuelva el enlace automático */
export const DESKTOP_DOWNLOAD_URL = DESKTOP_DOWNLOAD_URL_FALLBACK;

type DesktopDownloadState = {
	url: string;
	loading: boolean;
};

const initialState: DesktopDownloadState = {
	url: DESKTOP_DOWNLOAD_URL_FALLBACK,
	loading: Boolean(GITHUB_REPO && browser)
};

const { subscribe, set } = writable<DesktopDownloadState>(initialState);

async function fetchLatestMsiUrl(repo: string): Promise<string | null> {
	try {
		const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
			headers: { Accept: 'application/vnd.github.v3+json' }
		});
		if (!res.ok) return null;
		const data = (await res.json()) as { assets?: Array<{ name: string; browser_download_url: string }> };
		const msi = data.assets?.find((a) => a.name.toLowerCase().endsWith('.msi'));
		return msi?.browser_download_url ?? null;
	} catch {
		return null;
	}
}

/** Inicializa el store: en web, si hay GITHUB_REPO, obtiene el enlace directo al .msi de la última release. */
export function initDesktopDownloadUrl(): void {
	if (!browser || !GITHUB_REPO) return;
	set({ url: DESKTOP_DOWNLOAD_URL_FALLBACK, loading: true });
	fetchLatestMsiUrl(GITHUB_REPO).then((directUrl) => {
		set({
			url: directUrl || DESKTOP_DOWNLOAD_URL_FALLBACK,
			loading: false
		});
	});
}

export const desktopDownloadStore = {
	subscribe,
	init: initDesktopDownloadUrl
};
