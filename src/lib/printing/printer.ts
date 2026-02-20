/**
 * Bridge de impresión: Tauri (nativo) vs Web (fallback con window.print).
 * SSR-safe: solo usa Tauri cuando browser y window.__TAURI__; invoke vía dynamic import.
 */

import { browser } from '$app/environment';
import { get } from 'svelte/store';
import { businessStore } from '$lib/stores/business';

const PRINT_STORAGE_KEY = 'novum_print_ticket_text';
const PRINTER_STORAGE_KEY = 'novum_printer_name';

/** True si la app corre dentro de Tauri (desktop). Solo comprueba en browser. */
export function isTauri(): boolean {
	if (!browser || typeof window === 'undefined') return false;
	const w = window as unknown as { __TAURI__?: { core?: unknown }; __TAURI_INTERNALS__?: unknown };
	return !!(w.__TAURI__?.core ?? w.__TAURI_INTERNALS__);
}

/** Invoke de Tauri vía dynamic import (solo se carga en contexto Tauri, no en web). */
async function getTauriInvoke(): Promise<((cmd: string, args?: { payload?: unknown }) => Promise<unknown>) | null> {
	if (!browser || !isTauri()) return null;
	try {
		const { invoke } = await import('@tauri-apps/api/core');
		return invoke as (cmd: string, args?: { payload?: unknown }) => Promise<unknown>;
	} catch {
		return null;
	}
}

/** Nombre de la impresora guardada (localStorage). */
export function getSavedPrinterName(): string | null {
	if (!browser) return null;
	return localStorage.getItem(PRINTER_STORAGE_KEY);
}

/** Guarda el nombre de la impresora elegida. */
export function setSavedPrinterName(name: string): void {
	if (!browser) return;
	localStorage.setItem(PRINTER_STORAGE_KEY, name);
}

/**
 * Lista de impresoras del sistema. Solo en Tauri; en web devuelve [].
 */
export async function listPrinters(): Promise<string[]> {
	const invoke = await getTauriInvoke();
	if (!invoke) return [];
	try {
		const out = await invoke('list_printers');
		return (out as string[]) ?? [];
	} catch {
		return [];
	}
}

/**
 * Imprime un ticket de texto plano.
 * - Tauri: invoke print_ticket con impresora guardada (novum_printer_name) o la pasada; sin diálogo.
 * - Web: guarda texto, abre /print/ticket y usa window.print() como fallback.
 */
export async function printTicket(text: string, printerName?: string): Promise<void> {
	if (!browser) throw new Error('Impresión solo disponible en el navegador');

	const invoke = await getTauriInvoke();
	if (invoke) {
		const name = printerName ?? getSavedPrinterName() ?? undefined;
		const settings = get(businessStore);
		await invoke('print_ticket', {
			payload: {
				text,
				printerName: name || null,
				useCrlf: true,
				fontSizePt: settings.ticketFontSizePt ?? 30,
				marginLeft: settings.ticketMarginLeft ?? 5,
				marginRight: settings.ticketMarginRight ?? 40
			}
		});
		return;
	}

	// Fallback web: vista de impresión con window.print()
	localStorage.setItem(PRINT_STORAGE_KEY, text);
	window.open('/print/ticket', '_blank', 'noopener,noreferrer');
}

/** Lee el texto a imprimir desde localStorage (usado por la ruta /print/ticket). */
export function getStoredTicketText(): string | null {
	if (!browser) return null;
	return localStorage.getItem(PRINT_STORAGE_KEY);
}
