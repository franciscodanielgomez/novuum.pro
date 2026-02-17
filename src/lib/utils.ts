import { browser } from '$app/environment';

/** Solo dígitos 0-9 para teléfono de cliente */
export const PHONE_REGEX = /^[0-9]+$/;

export const generateId = (prefix: string) =>
	`${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const formatMoney = (value: number) =>
	new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(
		value || 0
	);

export const nowHour = () =>
	new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });

export const isoNow = () => new Date().toISOString();

export const sameDate = (a: string, yyyyMmDd: string) => a.slice(0, 10) === yyyyMmDd;

export const todayYmd = () => new Date().toISOString().slice(0, 10);

export const isBrowser = () => browser;
