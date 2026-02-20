import { writable } from 'svelte/store';

/**
 * El layout incrementa este valor cada cierto tiempo y al volver a la pestaña.
 * Las páginas que escuchan recargan sus datos para mantener la app conectada y actualizada.
 */
export const refreshTrigger = writable(0);
