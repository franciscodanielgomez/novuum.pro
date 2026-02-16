import { readable } from 'svelte/store';

export const fromZustand = <TState>(store: {
	getState: () => TState;
	subscribe: (listener: (state: TState, prevState: TState) => void) => () => void;
}) =>
	readable(store.getState(), (set) => {
		const unsub = store.subscribe((state) => set(state));
		return () => unsub();
	});
