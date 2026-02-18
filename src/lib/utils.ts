import { browser } from '$app/environment';

/** Zona horaria usada en la app (Argentina) */
export const APP_TIMEZONE = 'America/Argentina/Buenos_Aires';

/** Solo dígitos 0-9 para teléfono de cliente */
export const PHONE_REGEX = /^[0-9]+$/;

export const generateId = (prefix: string) =>
	`${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const formatMoney = (value: number) =>
	new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(
		value || 0
	);

export const nowHour = () =>
	new Date().toLocaleTimeString('es-AR', {
		timeZone: APP_TIMEZONE,
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	});

export const isoNow = () => new Date().toISOString();

/** Fecha de un ISO en Argentina (YYYY-MM-DD) */
export const dateInArgentinaYmd = (iso: string): string =>
	new Date(iso).toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE });

/** True si la fecha del ISO (en Argentina) coincide con yyyyMmDd */
export const sameDate = (a: string, yyyyMmDd: string) => dateInArgentinaYmd(a) === yyyyMmDd;

/** Hoy en Argentina (YYYY-MM-DD) */
export const todayYmd = () =>
	new Date().toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE });

/** Formato dd/MM/yy - HH:mm para listados, en hora Argentina */
export const formatDateTime = (iso: string) => {
	const d = new Date(iso);
	const parts = new Intl.DateTimeFormat('es-AR', {
		timeZone: APP_TIMEZONE,
		day: '2-digit',
		month: '2-digit',
		year: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	}).formatToParts(d);
	const day = parts.find((p) => p.type === 'day')!.value;
	const month = parts.find((p) => p.type === 'month')!.value;
	const year = parts.find((p) => p.type === 'year')!.value;
	const hour = parts.find((p) => p.type === 'hour')!.value;
	const minute = parts.find((p) => p.type === 'minute')!.value;
	return `${day}/${month}/${year} - ${hour}:${minute}`;
};

/** Fecha en Argentina como dd/MM/yyyy */
export const formatDateDDMMYYYY = (iso: string): string => {
	const d = new Date(iso);
	const parts = new Intl.DateTimeFormat('es-AR', {
		timeZone: APP_TIMEZONE,
		day: '2-digit',
		month: '2-digit',
		year: 'numeric'
	}).formatToParts(d);
	const day = parts.find((p) => p.type === 'day')!.value;
	const month = parts.find((p) => p.type === 'month')!.value;
	const year = parts.find((p) => p.type === 'year')!.value;
	return `${day}/${month}/${year}`;
};

/** Número de pedido con ceros a la izquierda (ej. 5 → "000005") para búsqueda y visualización */
const ORDER_NUMBER_PAD = 6;
export const formatOrderNumber = (n: number) => String(n).padStart(ORDER_NUMBER_PAD, '0');

export const isBrowser = () => browser;
