import { z } from 'zod';

export type Product = {
	id: string;
	name: string;
	base_price: number;
	active: boolean;
	created_at: string;
	updated_at: string;
};

export type ProductOptionGroup = {
	id: string;
	product_id: string;
	name: string;
	min_select: number;
	max_select: number;
	sort_order: number;
	created_at: string;
	updated_at: string;
};

export type ProductOption = {
	id: string;
	group_id: string;
	name: string;
	price_delta: number;
	active: boolean;
	sort_order: number;
	image_url?: string | null;
	created_at: string;
	updated_at: string;
};

export type OrderItem = {
	id: string;
	order_id: string;
	product_id: string;
	qty: number;
	unit_price: number;
};

export type OrderItemOption = {
	id: string;
	order_item_id: string;
	option_id: string;
	qty?: number;
};

const numeric = z.coerce.number();

export const productCreateSchema = z.object({
	name: z.string().min(2, 'Nombre requerido'),
	base_price: numeric.min(0, 'Precio inválido'),
	active: z.boolean().default(true)
});

export const productUpdateSchema = productCreateSchema.partial().extend({
	id: z.string().min(1)
});

const optionGroupBaseSchema = z.object({
	product_id: z.string().min(1, 'Producto requerido'),
	name: z.string().min(2, 'Nombre requerido'),
	min_select: numeric.int().min(0),
	max_select: numeric.int().min(1),
	sort_order: numeric.int().min(0).default(0)
});

export const optionGroupCreateSchema = optionGroupBaseSchema.refine((data) => data.max_select >= data.min_select, {
	message: 'max_select debe ser mayor o igual a min_select',
	path: ['max_select']
});

export const optionGroupUpdateSchema = optionGroupBaseSchema
	.partial()
	.extend({
		id: z.string().min(1)
	})
	.refine((data) => {
		if (data.min_select == null || data.max_select == null) return true;
		return data.max_select >= data.min_select;
	}, {
		message: 'max_select debe ser mayor o igual a min_select',
		path: ['max_select']
	});

export const optionCreateSchema = z.object({
	group_id: z.string().min(1, 'Grupo requerido'),
	name: z.string().min(1, 'Nombre requerido'),
	price_delta: numeric.default(0),
	active: z.boolean().default(true),
	sort_order: numeric.int().min(0).default(0)
});

export const optionUpdateSchema = optionCreateSchema.partial().extend({
	id: z.string().min(1)
});

export const validateSelections = (group: ProductOptionGroup, selectedOptionIds: string[]) => {
	const count = selectedOptionIds.length;
	const min = Math.max(0, group.min_select);
	const max = Math.max(1, group.max_select);
	if (count < min) {
		return {
			ok: false,
			message: `Seleccioná al menos ${min} opción(es) en ${group.name}`
		};
	}
	if (count > max) {
		return {
			ok: false,
			message: `Seleccioná como máximo ${max} opción(es) en ${group.name}`
		};
	}
	return { ok: true as const };
};

export const computeOrderItemPrice = (
	product: Pick<Product, 'base_price'>,
	selectedOptions: Array<Pick<ProductOption, 'price_delta'> & { qty?: number }>
) => {
	const optionsDelta = selectedOptions.reduce(
		(acc, option) => acc + option.price_delta * Math.max(1, option.qty ?? 1),
		0
	);
	return product.base_price + optionsDelta;
};
