import { writable } from 'svelte/store';

export type RefreshTriggerPayload = { reason: string; ts: number };

const { subscribe, set } = writable<RefreshTriggerPayload>({ reason: '', ts: 0 });

/**
 * Store que emite { reason, ts } para que las páginas revaliden datos.
 * Las páginas deben reaccionar SOLO a reason === 'manual' o 'afterMutation';
 * NO reaccionar a eventos de sesión (INITIAL_SESSION, SIGNED_IN, etc.) — el return-to-app
 * handshake solo verifica sesión y no dispara refreshTrigger.
 */
export const refreshTrigger = {
	subscribe,
	set,
	/** Emite un refresh con reason; las páginas filtran por 'manual' | 'afterMutation'. */
	emit: (reason: string) => {
		const payload: RefreshTriggerPayload = { reason, ts: Date.now() };
		set(payload);
	}
};
