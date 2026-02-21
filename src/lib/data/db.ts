import { withTimeoutAbort } from '$lib/with-timeout-abort';
import { supabase } from '$lib/supabase/client';
import { timeoutForMethod } from '$lib/network/timeout-policy';
import { AppError, toAppError } from '$lib/data/errors';

type DbMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

type DbOpts = {
	signal?: AbortSignal;
	timeoutMs?: number;
	source?: string;
};

type Match = Record<string, string | number | boolean | null>;
type DbResult<T> = { data: T | null; error: unknown };
type DbDeleteResult = { error: unknown };

function getTimeout(method: DbMethod, timeoutMs?: number): number {
	return timeoutMs ?? timeoutForMethod(method);
}

async function runDb<T>(
	method: DbMethod,
	resource: string,
	opts: DbOpts | undefined,
	fn: (signal: AbortSignal) => PromiseLike<T>
): Promise<T> {
	const source = opts?.source ?? `db.${method.toLowerCase()}`;
	try {
		if (opts?.signal) {
			return await fn(opts.signal);
		}
		return await withTimeoutAbort(fn, getTimeout(method, opts?.timeoutMs), {
			method,
			url: resource,
			source
		});
	} catch (error) {
		throw toAppError(error);
	}
}

function applyMatch<TBuilder extends { eq: (k: string, v: unknown) => TBuilder }>(
	builder: TBuilder,
	match: Match
): TBuilder {
	let current = builder;
	for (const [k, v] of Object.entries(match)) {
		current = current.eq(k, v);
	}
	return current;
}

function throwIfDbError(error: unknown): void {
	if (!error) return;
	throw toAppError(error);
}

export async function dbSelect<T>(
	table: string,
	queryFn: (ctx: { signal: AbortSignal; client: typeof supabase }) => PromiseLike<DbResult<T>>,
	opts?: DbOpts
): Promise<T> {
	const result = await runDb<DbResult<T>>('GET', `/rest/v1/${table}`, opts, (signal) =>
		queryFn({ signal, client: supabase })
	);
	throwIfDbError(result.error);
	return (result.data ?? ([] as unknown as T)) as T;
}

export async function dbInsert<T>(
	table: string,
	payload: unknown,
	queryFn?: (ctx: {
		signal: AbortSignal;
		client: typeof supabase;
		payload: unknown;
	}) => PromiseLike<DbResult<T>>,
	opts?: DbOpts
): Promise<T> {
	const result = await runDb<DbResult<T>>('POST', `/rest/v1/${table}`, opts, (signal) => {
		if (queryFn) return queryFn({ signal, client: supabase, payload });
		return supabase
			.from(table)
			.insert(payload)
			.select('*')
			.abortSignal(signal)
			.single() as PromiseLike<DbResult<T>>;
	});
	throwIfDbError(result.error);
	return result.data as T;
}

export async function dbUpdate<T>(
	table: string,
	payload: unknown,
	match: Match,
	queryFn?: (ctx: {
		signal: AbortSignal;
		client: typeof supabase;
		payload: unknown;
		match: Match;
	}) => PromiseLike<DbResult<T>>,
	opts?: DbOpts
): Promise<T> {
	const result = await runDb<DbResult<T>>('PATCH', `/rest/v1/${table}`, opts, (signal) => {
		if (queryFn) return queryFn({ signal, client: supabase, payload, match });
		return applyMatch(supabase.from(table).update(payload).select('*').abortSignal(signal), match)
			.single() as PromiseLike<DbResult<T>>;
	});
	throwIfDbError(result.error);
	return result.data as T;
}

export async function dbDelete(
	table: string,
	match: Match,
	queryFn?: (ctx: {
		signal: AbortSignal;
		client: typeof supabase;
		match: Match;
	}) => PromiseLike<DbDeleteResult>,
	opts?: DbOpts
): Promise<void> {
	const result = await runDb<DbDeleteResult>('DELETE', `/rest/v1/${table}`, opts, (signal) => {
		if (queryFn) return queryFn({ signal, client: supabase, match });
		return applyMatch(supabase.from(table).delete().abortSignal(signal), match) as PromiseLike<DbDeleteResult>;
	});
	throwIfDbError(result.error);
}

export async function dbRpc<T>(
	fn: string,
	args: Record<string, unknown>,
	opts?: DbOpts
): Promise<T> {
	const result = await runDb<DbResult<T>>('POST', `/rest/v1/rpc/${fn}`, opts, (signal) =>
		supabase.rpc(fn, args).abortSignal(signal) as PromiseLike<DbResult<T>>
	);
	throwIfDbError(result.error);
	return result.data as T;
}

export { AppError };

