export type StaffRole = 'CAJERO' | 'CADETE' | 'ADMINISTRADOR' | 'GESTOR';
export type OrderStatus = 'BORRADOR' | 'NO_ASIGNADO' | 'ASIGNADO' | 'COMPLETADO' | 'CANCELADO';
/** Nombre del método de pago (p. ej. desde payment_methods: 'Efectivo', 'Mercadopago') */
export type PaymentMethod = string;
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
	/** Varios roles (en UI multiselect). Si está vacío se usa role. */
	roles?: StaffRole[];
	active: boolean;
};

/** Miembro del equipo sin cuenta (no tiene email/contraseña) */
export type StaffGuest = {
	id: string;
	name: string;
	role: StaffRole;
	/** Varios roles (en UI multiselect). Si está vacío se usa role. */
	roles?: StaffRole[];
	/** Email de contacto (opcional). */
	email?: string;
	phone?: string;
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

/** Borrador de pedido en la pantalla Crear pedido (cards en curso) */
export type OrderDraft = {
	id: string;
	title: string;
	selectedCustomerId: string | null;
	categoryId: string;
	cart: OrderItem[];
	paymentMethod: PaymentMethod;
	cashReceived: number;
	/** Costo de envío (delivery) */
	deliveryCost: number;
	notes: string;
	createdAt?: string;
	customerPhoneSnapshot?: string;
	addressSnapshot?: string;
	betweenStreetsSnapshot?: string;
	/** ID del pedido BORRADOR en el repo (localStorage) */
	orderId?: string;
};

export type Order = {
	id: string;
	/** Número secuencial de pedido (1, 2, 3...) para listados e impresión */
	orderNumber: number;
	createdAt: string;
	hour: string;
	customerId: string;
	customerPhoneSnapshot: string;
	addressSnapshot: string;
	betweenStreetsSnapshot?: string;
	status: OrderStatus;
	assignedStaffId?: string;
	assignedStaffGuestId?: string;
	paymentMethod: PaymentMethod;
	cashReceived?: number;
	changeDue?: number;
	notes?: string;
	/** Costo de envío del pedido */
	deliveryCost?: number;
	total: number;
	/** Usuario (team_members) que tomó el pedido */
	createdByUserId?: string;
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
