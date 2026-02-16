export type StaffRole = 'CAJERO' | 'CADETE' | 'ADMINISTRADOR' | 'GESTOR';
export type OrderStatus = 'NO_ASIGNADO' | 'ASIGNADO' | 'COMPLETADO' | 'CANCELADO';
export type PaymentMethod = 'CASH' | 'MP' | 'TRANSFER';
export type ShiftTurn = 'MAÑANA' | 'TARDE' | 'NOCHE';

export type Customer = {
	id: string;
	phone: string;
	address: string;
	betweenStreets?: string;
	notes?: string;
	createdAt: string;
};

export type Staff = {
	id: string;
	name: string;
	email?: string;
	phone?: string;
	role: StaffRole;
	active: boolean;
};

export type ProductCategory = {
	id: string;
	name: string;
	sort: number;
};

export type Product = {
	id: string;
	categoryId: string;
	name: string;
	description: string;
	imageUrl?: string;
};

export type SKU = {
	id: string;
	productId: string;
	label: string;
	price: number;
};

export type OrderItem = {
	id: string;
	skuId: string;
	nameSnapshot: string;
	qty: number;
	unitPrice: number;
	subtotal: number;
	notes?: string;
	selectedOptions?: Array<{
		optionId: string;
		groupId: string;
		nameSnapshot: string;
		priceDelta: number;
		qty: number;
	}>;
};

export type Order = {
	id: string;
	createdAt: string;
	hour: string;
	customerId: string;
	customerPhoneSnapshot: string;
	addressSnapshot: string;
	betweenStreetsSnapshot?: string;
	status: OrderStatus;
	assignedStaffId?: string;
	paymentMethod: PaymentMethod;
	cashReceived?: number;
	changeDue?: number;
	notes?: string;
	total: number;
	cashierNameSnapshot?: string;
	shiftId?: string;
	items: OrderItem[];
};

export type Shift = {
	id: string;
	openedAt: string;
	closedAt?: string;
	turn: ShiftTurn;
	cashierStaffId: string;
	status: 'OPEN' | 'CLOSED';
	totalsByPayment: Record<PaymentMethod, number>;
	total: number;
};

export type SessionData = {
	location: 'Ituzaingó';
};

export type AppUser = {
	id: string;
	email: string;
	name: string;
	role: StaffRole;
	avatarUrl?: string;
};
