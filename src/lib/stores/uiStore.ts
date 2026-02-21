import { get, writable } from 'svelte/store';

export type UIState = {
	modalOpen: boolean;
	formDirty: boolean;
	stale: boolean;
	reconnectFailed: boolean;
	/** true cuando se pospuso el handshake por modal/formDirty; mostrar Reintentar */
	pendingReturnHandshake: boolean;
};

const initialState: UIState = {
	modalOpen: false,
	formDirty: false,
	stale: false,
	reconnectFailed: false,
	pendingReturnHandshake: false
};

const store = writable<UIState>(initialState);
const { subscribe, update } = store;

export const uiStore = {
	subscribe,
	getState: (): UIState => get(store),
	setModalOpen(value: boolean) {
		update((s) => ({ ...s, modalOpen: value }));
	},
	setFormDirty(value: boolean) {
		update((s) => ({ ...s, formDirty: value }));
	},
	setStale(value: boolean) {
		update((s) => ({ ...s, stale: value }));
	},
	setReconnectFailed(value: boolean) {
		update((s) => ({ ...s, reconnectFailed: value }));
	},
	/** For internal use by returnToApp handshake */
	_update(state: Partial<UIState>) {
		update((s) => ({ ...s, ...state }));
	}
};
