/**
 * Ejecuta una función con timeout y AbortController real.
 * Forma recomendada: withTimeoutAbort((signal) => request(signal), 15_000)
 * También soporta la firma anterior por compatibilidad: withTimeoutAbort(15_000, fn)
 */
import { areTimeoutsDisabled } from '$lib/network/timeout-policy';
import { dev } from '$app/environment';

type TimeoutDebugMeta = {
	method?: string;
	url?: string;
	source?: string;
};

export async function withTimeoutAbort<T>(
	promiseFn: (signal: AbortSignal) => PromiseLike<T>,
	ms: number,
	meta?: TimeoutDebugMeta
): Promise<T>;
export async function withTimeoutAbort<T>(
	ms: number,
	promiseFn: (signal: AbortSignal) => PromiseLike<T>,
	meta?: TimeoutDebugMeta
): Promise<T>;
export async function withTimeoutAbort<T>(
	arg1: number | ((signal: AbortSignal) => PromiseLike<T>),
	arg2: number | ((signal: AbortSignal) => PromiseLike<T>),
	arg3?: TimeoutDebugMeta
): Promise<T> {
	const promiseFn =
		typeof arg1 === 'function'
			? arg1
			: (arg2 as (signal: AbortSignal) => PromiseLike<T>);
	const ms = typeof arg1 === 'number' ? arg1 : (arg2 as number);
	const meta = arg3;
	const method = (meta?.method ?? 'GET').toUpperCase();
	const url = meta?.url ?? 'unknown';
	const source = meta?.source ?? 'withTimeoutAbort';
	const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
	const timeoutsDisabled = areTimeoutsDisabled();

	if (timeoutsDisabled) {
		try {
			const result = await promiseFn(new AbortController().signal);
			if (dev && typeof console !== 'undefined') {
				const elapsed = Math.round(
					(typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt
				);
				console.debug('[timeout][dev-disabled]', { source, method, url, elapsedMs: elapsed, timeoutMs: ms });
			}
			return result;
		} catch (error) {
			if (dev && typeof console !== 'undefined') {
				const elapsed = Math.round(
					(typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt
				);
				console.debug('[timeout][dev-disabled][error]', {
					source,
					method,
					url,
					elapsedMs: elapsed,
					timeoutMs: ms,
					error: error instanceof Error ? error.message : String(error)
				});
			}
			throw error;
		}
	}

	const controller = new AbortController();
	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	let timedOut = false;
	const timeoutPromise = new Promise<never>((_, reject) => {
		timeoutId = setTimeout(() => {
			timedOut = true;
			controller.abort();
			reject(new DOMException('Request timed out', 'AbortError'));
		}, ms);
	});
	try {
		if (dev && typeof console !== 'undefined') {
			console.debug('[timeout][start]', { source, method, url, timeoutMs: ms });
		}
		return await Promise.race([promiseFn(controller.signal), timeoutPromise]);
	} catch (error) {
		if (dev && typeof console !== 'undefined') {
			const elapsed = Math.round(
				(typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt
			);
			console.debug('[timeout][error]', {
				source,
				method,
				url,
				elapsedMs: elapsed,
				timeoutMs: ms,
				aborted: error instanceof Error && error.name === 'AbortError',
				abortedBy: timedOut ? 'timeout-wrapper' : 'external',
				error: error instanceof Error ? error.message : String(error)
			});
		}
		throw error;
	} finally {
		if (timeoutId) clearTimeout(timeoutId);
		if (dev && typeof console !== 'undefined') {
			const elapsed = Math.round(
				(typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt
			);
			console.debug('[timeout][end]', {
				source,
				method,
				url,
				elapsedMs: elapsed,
				timeoutMs: ms,
				timedOut
			});
		}
	}
}
