/**
 * Bridge de impresión: Tauri (nativo) vs Web (fallback con window.print).
 * No importa @tauri-apps/api para que la versión web funcione sin dependencias Tauri.
 */

import { browser } from '$app/environment';

const PRINT_STORAGE_KEY = 'novum_print_ticket_text';
const PRINTER_STORAGE_KEY = 'novum_printer_name';

/** Invoke de Tauri inyectado en window (solo existe dentro de la app desktop). */
function getTauriInvoke(): ((cmd: string, args?: { payload?: unknown }) => Promise<unknown>) | null {
	if (!browser || typeof window === 'undefined') return null;
	const t = (window as unknown as { __TAURI__?: { core?: { invoke: (cmd: string, args?: { payload?: unknown }) => Promise<unknown> } } })
		.__TAURI__;
	return t?.core?.invoke ?? null;
}

/** True si la app corre dentro de Tauri (desktop). */
export function isTauri(): boolean {
	return getTauriInvoke() !== null;
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
	const invoke = getTauriInvoke();
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
 * - Tauri: invoke print_ticket (sin diálogo, spooler del sistema).
 * - Web: guarda texto, abre /print/ticket y usa window.print() como fallback.
 */
export async function printTicket(text: string, printerName?: string): Promise<void> {
	if (!browser) throw new Error('Impresión solo disponible en el navegador');

	const invoke = getTauriInvoke();
	if (invoke) {
		await invoke('print_ticket', {
			payload: { text, printerName: printerName ?? null }
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
