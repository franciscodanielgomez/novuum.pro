import { z } from 'zod';
import { PHONE_REGEX } from '$lib/utils';

export const customerSchema = z.object({
	phone: z
		.string()
		.min(6, 'Teléfono requerido (mínimo 6 dígitos)')
		.regex(PHONE_REGEX, 'Solo números, sin espacios ni letras'),
	address: z.string().min(1, 'Dirección requerida'),
	betweenStreets: z.string().optional(),
	notes: z.string().optional()
});

/** Esquema para agregar muchos clientes a la vez (array de clientes) */
export const customersBulkSchema = z.array(customerSchema);

export type CustomerInput = z.infer<typeof customerSchema>;

export const staffSchema = z.object({
	name: z.string().min(2, 'Nombre requerido'),
	phone: z.string().optional(),
	role: z.enum(['CAJERO', 'CADETE', 'ADMINISTRADOR', 'GESTOR']),
	active: z.boolean()
});
