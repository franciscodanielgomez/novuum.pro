/**
 * Debounce a function.
 */
export function debounce<T extends (...args: unknown[]) => unknown>(fn: T, ms: number): (...args: Parameters<T>) => void {
	let timeout: ReturnType<typeof setTimeout> | null = null;
	return (...args: Parameters<T>) => {
		if (timeout) clearTimeout(timeout);
		timeout = setTimeout(() => {
			timeout = null;
			fn(...args);
		}, ms);
	};
}

/**
 * Get a nested value from an object by path (e.g. "address.street").
 */
export function getByPath(obj: Record<string, unknown>, path: string): unknown {
	const parts = path.split('.');
	let current: unknown = obj;
	for (const p of parts) {
		if (current == null || typeof current !== 'object') return undefined;
		current = (current as Record<string, unknown>)[p];
	}
	return current;
}

/**
 * Build a single search string from a row and a list of keys (field paths or accessors).
 * Used for global search: we concatenate values from keys and check if the query is included.
 */
export function getRowSearchString<T>(row: T, keys: (keyof T | string)[]): string {
	const parts: string[] = [];
	for (const k of keys) {
		const v = typeof k === 'string' && k.includes('.')
			? getByPath(row as unknown as Record<string, unknown>, k)
			: (row as Record<string, unknown>)[k as string];
		if (v != null && typeof v === 'string') parts.push(v);
		else if (v != null) parts.push(String(v));
	}
	return parts.join(' ').toLowerCase();
}

/**
 * Filter rows by global search query (case-insensitive, checks all keys).
 */
export function applyGlobalSearch<T>(rows: T[], query: string, keys: (keyof T | string)[]): T[] {
	const q = query.trim().toLowerCase();
	if (!q) return rows;
	return rows.filter((row) => getRowSearchString(row, keys).includes(q));
}

/**
 * Apply a single filter (chips = one of selected values; date = exact date match; select = one of).
 */
export function applyFilter<T>(
	rows: T[],
	filterId: string,
	filterValue: unknown,
	accessor: (row: T) => unknown
): T[] {
	if (filterValue == null || filterValue === '' || filterValue === 'ALL') return rows;
	return rows.filter((row) => {
		const v = accessor(row);
		if (filterValue instanceof Date) {
			const d = typeof v === 'string' ? v.slice(0, 10) : v;
			return d === filterValue.toISOString().slice(0, 10);
		}
		if (typeof filterValue === 'string' && typeof v === 'string') {
			return v.slice(0, 10) === filterValue.slice(0, 10);
		}
		if (Array.isArray(filterValue)) return filterValue.includes(v);
		return v === filterValue;
	});
}
