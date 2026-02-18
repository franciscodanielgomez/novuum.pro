/**
 * Helpers para formatear tickets térmicos (58mm; menos cols = texto más grande en impresora y PDF).
 * Usar en Tauri (impresión nativa) o en vista web de impresión.
 */

import type { Order } from '$lib/types';
import { formatMoney, formatOrderNumber, formatDateDDMMYYYY } from '$lib/utils';

/** Ancho en caracteres: 28 = texto más grande en 58mm (impresión y PDF). */
const DEFAULT_WIDTH = 28;

/** Centra un texto en un ancho dado (espacios a izquierda/derecha). */
export function center(text: string, width: number = DEFAULT_WIDTH): string {
	const t = String(text).slice(0, width);
	const pad = Math.max(0, width - t.length);
	const left = Math.floor(pad / 2);
	const right = pad - left;
	return ' '.repeat(left) + t + ' '.repeat(right);
}

/** Rellena a la derecha hasta `width` (alineación izquierda del valor). */
export function padRight(text: string, width: number = DEFAULT_WIDTH): string {
	const t = String(text).slice(0, width);
	return t + ' '.repeat(Math.max(0, width - t.length));
}

/** Rellena a la izquierda hasta `width` (alineación derecha del valor). */
export function padLeft(text: string, width: number = DEFAULT_WIDTH): string {
	const t = String(text).slice(0, width);
	return ' '.repeat(Math.max(0, width - t.length)) + t;
}

/** Formato ARS con coma decimal (ej: 14400,00). */
export function moneyARS(n: number): string {
	const fixed = (Math.round(n * 100) / 100).toFixed(2);
	return fixed.replace('.', ',');
}

/** Envuelve texto largo en líneas de máximo `width` caracteres. */
export function wrap(text: string, width: number = DEFAULT_WIDTH): string[] {
	const raw = String(text).trim();
	if (!raw) return [];
	const words = raw.split(/\s+/);
	const lines: string[] = [];
	let current = '';
	for (const w of words) {
		const next = current ? current + ' ' + w : w;
		if (next.length <= width) {
			current = next;
		} else {
			if (current) lines.push(current);
			if (w.length > width) {
				for (let i = 0; i < w.length; i += width) {
					lines.push(w.slice(i, i + width));
				}
				current = '';
			} else {
				current = w;
			}
		}
	}
	if (current) lines.push(current);
	return lines;
}

/** Línea separadora de ancho fijo. */
export function separator(width: number = DEFAULT_WIDTH): string {
	return '-'.repeat(width);
}

/** Genera el texto del ticket de prueba (mismo ancho que pedidos). */
export function demoTicketText(): string {
	const w = DEFAULT_WIDTH;
	const sep = separator(w);
	const lines = [
		sep,
		'PEDIDO',
		'Original',
		sep,
		'ID: 3',
		'Fecha: 13/02/2026',
		'Hora: 20:12',
		'',
		'Telefono: 1557966469',
		'Direccion: BARBOSA 2825',
		'Entre calles: ESPACIO VERDE',
		'',
		'Observacion:',
		'Observacion pedido:',
		'',
		'Cajero: LUCAS',
		'Cadete: -',
		'',
		'DETALLE',
		'3LTS N°4 D-F-V',
		'x1 - $14400',
		'Delivery',
		'x1 - $1000',
		'',
		'TOTAL: $15400',
		'Paga: MP',
		sep
	];
	return lines.join('\n');
}

export type TicketVariant = 'original' | 'copia';

/** Genera el cuerpo común del ticket (sin cabecera Original/Copia). Todo envuelto a 58mm (w chars). */
function orderTicketBody(order: Order, cadeteName: string, w: number): string[] {
	const lines: string[] = [
		...wrap(`No. pedido: ${formatOrderNumber(order.orderNumber)}`, w),
		...wrap(`Fecha: ${formatDateDDMMYYYY(order.createdAt)}`, w),
		...wrap(`Hora: ${order.hour ?? ''}`, w),
		'',
		...wrap(`Telefono: ${(order.customerPhoneSnapshot ?? '').trim() || '-'}`, w),
		...wrap(`Direccion: ${order.addressSnapshot ?? ''}`, w),
		...wrap(`Entre calles: ${(order.betweenStreetsSnapshot ?? '').trim() || '-'}`, w),
		'',
		...wrap(`Observacion: ${(order.notes ?? '').trim() || '-'}`, w),
		...wrap(`Observacion del pedido: ${(order.notes ?? '').trim() || '-'}`, w),
		'',
		...wrap(`Tomado por: ${(order.cashierNameSnapshot ?? '').trim() || '-'}`, w),
		...wrap(`Cadete: ${cadeteName || '-'}`, w),
		'',
		'DETALLE'
	];
	for (const i of order.items) {
		// Fila 1: nombre (varias líneas si es largo)
		lines.push(...wrap(i.nameSnapshot, w));
		// Fila 2: cantidad x precio unitario
		lines.push(...wrap(`${i.qty} x ${formatMoney(i.unitPrice)}`, w));
		// Fila 3: subtotal del ítem
		lines.push(...wrap(formatMoney(i.subtotal), w));
	}
	const subtotal = order.items.reduce((acc, i) => acc + i.subtotal, 0);
	const envio = order.deliveryCost ?? (order.total > subtotal ? order.total - subtotal : 0);
	lines.push('');
	lines.push(...wrap(`SUBTOTAL DEL PEDIDO: ${formatMoney(subtotal)}`, w));
	if (envio > 0) {
		lines.push(...wrap(`ENVIO: ${formatMoney(envio)}`, w));
	}
	lines.push(...wrap(`TOTAL: ${formatMoney(order.total)}`, w));
	lines.push('');
	lines.push(...wrap(`Metodo de pago: ${order.paymentMethod ?? '-'}`, w));
	if (order.cashReceived != null && order.cashReceived > 0) {
		lines.push(...wrap(`Paga con: ${formatMoney(order.cashReceived)}`, w));
	}
	if (order.changeDue != null && order.changeDue > 0) {
		lines.push(...wrap(`Vuelto: ${formatMoney(order.changeDue)}`, w));
	}
	lines.push('');
	lines.push('GRACIAS POR SU COMPRA');
	return lines;
}

/** Genera texto de un ticket térmico para un pedido (Original o Duplicado). */
export function orderToTicketText(
	order: Order,
	cadeteName: string,
	variant: TicketVariant = 'original'
): string {
	const w = DEFAULT_WIDTH;
	const sep = separator(w);
	const subtitulo = variant === 'original' ? 'Original' : 'Duplicado';
	const lines: string[] = [
		sep,
		'PEDIDO',
		subtitulo,
		sep,
		'',
		...orderTicketBody(order, cadeteName, w),
		'',
		sep
	];
	return lines.join('\n');
}
