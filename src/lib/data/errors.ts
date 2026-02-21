export type AppErrorKind =
	| 'timeout'
	| 'network'
	| 'auth'
	| 'forbidden'
	| 'database'
	| 'unknown';

export class AppError extends Error {
	kind: AppErrorKind;
	code?: string;
	status?: number;
	recoverable: boolean;
	cause?: unknown;

	constructor(params: {
		message: string;
		kind: AppErrorKind;
		code?: string;
		status?: number;
		recoverable: boolean;
		cause?: unknown;
	}) {
		super(params.message);
		this.name = 'AppError';
		this.kind = params.kind;
		this.code = params.code;
		this.status = params.status;
		this.recoverable = params.recoverable;
		this.cause = params.cause;
	}
}

export function toAppError(error: unknown): AppError {
	if (error instanceof AppError) return error;

	if (error instanceof DOMException && error.name === 'AbortError') {
		return new AppError({
			message: 'Request timed out',
			kind: 'timeout',
			recoverable: true,
			cause: error
		});
	}

	const maybe = error as {
		message?: string;
		code?: string;
		status?: number;
		name?: string;
	};

	const status = typeof maybe?.status === 'number' ? maybe.status : undefined;
	if (status === 401) {
		return new AppError({
			message: maybe?.message ?? 'Unauthorized',
			kind: 'auth',
			status,
			code: maybe?.code,
			recoverable: true,
			cause: error
		});
	}
	if (status === 403) {
		return new AppError({
			message: maybe?.message ?? 'Forbidden',
			kind: 'forbidden',
			status,
			code: maybe?.code,
			recoverable: true,
			cause: error
		});
	}
	if (typeof maybe?.code === 'string' || status != null) {
		return new AppError({
			message: maybe?.message ?? 'Database error',
			kind: 'database',
			status,
			code: maybe?.code,
			recoverable: true,
			cause: error
		});
	}
	if (error instanceof TypeError) {
		return new AppError({
			message: error.message || 'Network error',
			kind: 'network',
			recoverable: true,
			cause: error
		});
	}

	return new AppError({
		message: maybe?.message ?? 'Unknown error',
		kind: 'unknown',
		code: maybe?.code,
		status,
		recoverable: false,
		cause: error
	});
}

