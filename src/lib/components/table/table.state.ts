import type { DataTablePersistedState } from './table.types';

const PREFIX = 'datatable:';

export function loadTableState(tableId: string): Partial<DataTablePersistedState> | null {
	if (typeof window === 'undefined') return null;
	try {
		const raw = localStorage.getItem(PREFIX + tableId);
		if (!raw) return null;
		return JSON.parse(raw) as Partial<DataTablePersistedState>;
	} catch {
		return null;
	}
}

export function saveTableState(tableId: string, state: Partial<DataTablePersistedState>): void {
	if (typeof window === 'undefined') return;
	try {
		localStorage.setItem(PREFIX + tableId, JSON.stringify(state));
	} catch {
		// ignore quota or parse errors
	}
}

export function clearTableState(tableId: string): void {
	if (typeof window === 'undefined') return;
	try {
		localStorage.removeItem(PREFIX + tableId);
	} catch {
		// ignore
	}
}
