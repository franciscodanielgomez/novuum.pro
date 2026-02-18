/**
 * Genera un PDF en formato ticket 58mm a partir del texto del pedido.
 * Todo el texto hace salto de línea para caber en 58mm (mismo ancho que POS).
 */

import { jsPDF } from 'jspdf';
import type { Order } from '$lib/types';
import { orderToTicketText } from '$lib/printing/ticket-layout';
import { formatOrderNumber } from '$lib/utils';

/** Ancho del ticket en mm (58mm = estándar POS). */
const WIDTH_MM = 58;
const HEIGHT_PAGE_MM = 400;
const MARGIN_MM = 2;
const LINE_HEIGHT_MM = 4;
const FONT_SIZE_PT = 8;
const MAX_Y_MM = HEIGHT_PAGE_MM - MARGIN_MM;
/** Máximo de caracteres por línea para que quepa en 58mm (no truncar, seguir abajo). */
const MAX_CHARS_PER_LINE = 28;

/**
 * Parte una línea larga en varias de máximo MAX_CHARS_PER_LINE (salto abajo en 58mm).
 */
function wrapLineForPdf(line: string): string[] {
	if (line.length <= MAX_CHARS_PER_LINE) return [line];
	const out: string[] = [];
	for (let i = 0; i < line.length; i += MAX_CHARS_PER_LINE) {
		out.push(line.slice(i, i + MAX_CHARS_PER_LINE));
	}
	return out;
}

/**
 * Dibuja el texto del ticket en el doc (varias páginas si hace falta). Modifica y.
 */
function drawTicketLines(
	doc: jsPDF,
	lines: string[],
	x: number,
	startY: number
): { y: number } {
	let y = startY;
	for (const line of lines) {
		const chunks = wrapLineForPdf(line);
		for (const chunk of chunks) {
			if (y > MAX_Y_MM) {
				doc.addPage([WIDTH_MM, HEIGHT_PAGE_MM], 'p');
				y = MARGIN_MM;
			}
			doc.text(chunk, x, y);
			y += LINE_HEIGHT_MM;
		}
	}
	return { y };
}

/**
 * Genera y descarga un PDF con dos hojas: primera Original, segunda Duplicado (58mm).
 */
export function downloadOrderTicketPdf(order: Order, cadeteName: string): void {
	const doc = new jsPDF({
		orientation: 'portrait',
		unit: 'mm',
		format: [WIDTH_MM, HEIGHT_PAGE_MM],
		hotfixes: ['pxScale']
	});

	doc.setFont('courier');
	doc.setFontSize(FONT_SIZE_PT);

	const x = MARGIN_MM;

	// Hoja 1: Original
	const textOriginal = orderToTicketText(order, cadeteName, 'original');
	drawTicketLines(doc, textOriginal.split('\n'), x, MARGIN_MM);

	// Hoja 2: Duplicado
	doc.addPage([WIDTH_MM, HEIGHT_PAGE_MM], 'p');
	const textDuplicado = orderToTicketText(order, cadeteName, 'copia');
	drawTicketLines(doc, textDuplicado.split('\n'), x, MARGIN_MM);

	const filename = `pedido-${formatOrderNumber(order.orderNumber)}.pdf`;
	doc.save(filename);
}
