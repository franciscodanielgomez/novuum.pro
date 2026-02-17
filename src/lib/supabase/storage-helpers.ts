import { supabase } from '$lib/supabase/client';

/**
 * Extrae la ruta dentro del bucket a partir de una URL pública de Supabase Storage.
 * Formato: .../object/public/<bucket>/<path>
 */
export function getStoragePathFromPublicUrl(bucket: string, publicUrl: string): string | null {
	const trimmed = publicUrl?.trim();
	if (!trimmed) return null;
	const prefix = `/object/public/${bucket}/`;
	const i = trimmed.indexOf(prefix);
	if (i === -1) return null;
	const after = trimmed.slice(i + prefix.length);
	const path = after.split('?')[0];
	return path ? decodeURIComponent(path) : null;
}

/**
 * Elimina un archivo de Storage si la URL es de nuestro bucket.
 * No lanza error si la URL no es de Supabase o el borrado falla (p. ej. ya no existe).
 */
export async function removeStorageFileIfOurs(bucket: string, publicUrl: string): Promise<void> {
	const path = getStoragePathFromPublicUrl(bucket, publicUrl);
	if (!path) return;
	const { error } = await supabase.storage.from(bucket).remove([path]);
	if (error) {
		console.warn('No se pudo borrar la imagen anterior en Storage:', error.message);
	}
}
