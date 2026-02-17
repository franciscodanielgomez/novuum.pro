import type { OrderDraft } from '$lib/types';
import { writable } from 'svelte/store';

export const DRAFTS_STORAGE_KEY = 'novum_create_order_drafts';

// Única fuente de verdad: array en el módulo. Al agregar siempre leemos este array, nunca un callback.
let _drafts: OrderDraft[] = [];

const { subscribe, set: setStore } = writable<OrderDraft[]>([]);

function flush() {
	setStore(_drafts);
}

export const createOrderDraftsStore = {
	subscribe,
	set(list: OrderDraft[]) {
		_drafts = list;
		flush();
	},
	/** Agrega un draft leyendo siempre el array actual del módulo (nunca reemplaza). */
	addDraft(draft: OrderDraft) {
		_drafts = [..._drafts, draft];
		flush();
	},
	update(updater: (list: OrderDraft[]) => OrderDraft[]) {
		_drafts = updater(_drafts);
		flush();
	},
	get current(): OrderDraft[] {
		return _drafts;
	}
};

export function getInitialDraftsFromStorage(skipRestore: boolean): {
	drafts: OrderDraft[];
	activeDraftId: string;
	draftCount: number;
} {
	if (skipRestore) return { drafts: [], activeDraftId: '', draftCount: 1 };
	if (typeof sessionStorage === 'undefined') return { drafts: [], activeDraftId: '', draftCount: 1 };
	try {
		const raw = sessionStorage.getItem(DRAFTS_STORAGE_KEY);
		if (!raw) return { drafts: [], activeDraftId: '', draftCount: 1 };
		const data = JSON.parse(raw) as {
			drafts: OrderDraft[];
			activeDraftId: string;
			draftCount: number;
		};
		if (!Array.isArray(data.drafts) || data.drafts.length === 0)
			return { drafts: [], activeDraftId: '', draftCount: 1 };
		const drafts: OrderDraft[] = data.drafts.map((d) => ({
			...d,
			deliveryCost: typeof d.deliveryCost === 'number' ? d.deliveryCost : 0
		}));
		const activeId =
			data.activeDraftId && drafts.some((d) => d.id === data.activeDraftId)
				? data.activeDraftId
				: drafts[0].id;
		return {
			drafts,
			activeDraftId: activeId,
			draftCount: typeof data.draftCount === 'number' ? data.draftCount : drafts.length
		};
	} catch {
		return { drafts: [], activeDraftId: '', draftCount: 1 };
	}
}
