/**
 * Helpers para formatear tickets térmicos (58mm = 32 cols, 80mm = 48 cols).
 * Usar en Tauri (impresión nativa) o en vista web de impresión.
 */

const DEFAULT_WIDTH = 32;

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

/** Genera el texto del ticket de prueba (32 caracteres de ancho). */
export function demoTicketText(): string {
	const w = 32;
	const sep = separator(w);
	const lines = [
		sep,
		center('PEDIDO', w),
		center('Original', w),
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
