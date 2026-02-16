import type { Customer, Product, ProductCategory, SKU, Staff } from '$lib/types';
import { generateId, isoNow } from '$lib/utils';

export const seedCategories: ProductCategory[] = [
	{ id: 'cat-congelados', name: 'Congelados Grido', sort: 1 },
	{ id: 'cat-sabores', name: 'Sabores', sort: 2 },
	{ id: 'cat-bombones', name: 'Bombones', sort: 3 },
	{ id: 'cat-palitos', name: 'Palitos', sort: 4 },
	{ id: 'cat-postres', name: 'Postres', sort: 5 },
	{ id: 'cat-promos', name: 'Promos', sort: 6 },
	{ id: 'cat-tortas', name: 'Tortas', sort: 7 },
	{ id: 'cat-salsas', name: 'Salsas', sort: 8 },
	{ id: 'cat-fiestas', name: 'Fiestas', sort: 9 }
];

const flavors: Array<{ name: string; imageUrl: string }> = [
	{ name: 'Dulce de Leche', imageUrl: 'https://placehold.co/120x120?text=DDL' },
	{ name: 'Chocolate', imageUrl: 'https://placehold.co/120x120?text=Choco' },
	{ name: 'Frutilla', imageUrl: 'https://placehold.co/120x120?text=Frutilla' },
	{ name: 'Vainilla', imageUrl: 'https://placehold.co/120x120?text=Vainilla' },
	{ name: 'Menta Granizada', imageUrl: 'https://placehold.co/120x120?text=Menta' },
	{ name: 'Cookies', imageUrl: 'https://placehold.co/120x120?text=Cookies' }
];

export const seedProducts: Product[] = [
	...flavors.map((flavor, i) => ({
		id: `prod-sabor-${i + 1}`,
		categoryId: 'cat-sabores',
		name: `${flavor.name} (A granel)`,
		description: 'Helado a granel',
		imageUrl: flavor.imageUrl
	})),
	{
		id: 'prod-palito-frutal',
		categoryId: 'cat-palitos',
		name: 'Palito Frutal',
		description: 'Pack x6'
	},
	{
		id: 'prod-bombon-suizo',
		categoryId: 'cat-bombones',
		name: 'Bombón Suizo',
		description: 'Caja x8'
	},
	{
		id: 'prod-torta-oreo',
		categoryId: 'cat-tortas',
		name: 'Torta Oreo',
		description: 'Torta helada'
	}
];

export const seedSkus: SKU[] = [
	...seedProducts
		.filter((p) => p.categoryId === 'cat-sabores')
		.flatMap((product) => [
			{ id: `sku-${product.id}-1kg`, productId: product.id, label: '1KG', price: 12000 },
			{ id: `sku-${product.id}-1-2`, productId: product.id, label: '1/2KG', price: 7000 },
			{ id: `sku-${product.id}-1-4`, productId: product.id, label: '1/4KG', price: 4200 }
		]),
	{ id: 'sku-palito-frutal', productId: 'prod-palito-frutal', label: 'Unidad', price: 3500 },
	{ id: 'sku-bombon-suizo', productId: 'prod-bombon-suizo', label: 'Caja', price: 9800 },
	{ id: 'sku-torta-oreo', productId: 'prod-torta-oreo', label: 'Unidad', price: 14500 }
];

export const seedStaff: Staff[] = [
	{ id: 'staff-caja-1', name: 'María Caja', phone: '11 5555 1111', role: 'CAJERO', active: true },
	{ id: 'staff-cadete-1', name: 'Juan Cadete', phone: '11 4444 2222', role: 'CADETE', active: true },
	{ id: 'staff-admin-1', name: 'Admin', phone: '11 3333 3333', role: 'ADMINISTRADOR', active: true }
];

const sampleAddress = [
	'Soler 123',
	'Mansilla 456',
	'Santa Rosa 789',
	'Belgrano 450',
	'Rivadavia 1220',
	'Pringles 860',
	'Laprida 132',
	'Castelar 455',
	'Gdor. Inocencio Arias 300',
	'General Paz 1400'
];

export const seedCustomers: Customer[] = sampleAddress.map((address, index) => ({
	id: generateId('cus'),
	phone: `11 6000 10${(index + 10).toString().slice(-2)}`,
	address,
	betweenStreets: 'Entre A y B',
	notes: index % 2 === 0 ? 'Tocar timbre una vez' : '',
	createdAt: isoNow()
}));
