type AsyncGuardOpts = {
	setLoading?: (loading: boolean) => void;
	onError?: (error: unknown) => void;
	rethrow?: boolean;
};

export async function asyncGuard<T>(
	run: () => Promise<T>,
	opts?: AsyncGuardOpts
): Promise<T | undefined> {
	opts?.setLoading?.(true);
	try {
		return await run();
	} catch (error) {
		opts?.onError?.(error);
		if (opts?.rethrow) throw error;
		return undefined;
	} finally {
		opts?.setLoading?.(false);
	}
}
