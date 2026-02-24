import { AppError } from '$lib/data/errors';
import { dbDelete, dbInsert, dbSelect, dbUpdate } from '$lib/data/db';
import type { Customer } from '$lib/types';

type Row = {
	id: string;
	phone: string;
	address: string;
	between_streets: string | null;
	notes: string | null;
	created_at: string;
};

function rowToCustomer(row: Row): Customer {
	return {
		id: row.id,
		phone: row.phone,
		address: row.address,
		betweenStreets: row.between_streets ?? undefined,
		notes: row.notes ?? undefined,
		createdAt: row.created_at
	};
}

export const customersRepo = {
	async list(signal?: AbortSignal): Promise<Customer[]> {
		const data = await dbSelect<Row[]>(
			'customers',
			({ signal: dbSignal, client }) =>
				client
					.from('customers')
					.select('id, phone, address, between_streets, notes, created_at')
					.order('created_at', { ascending: false })
					.abortSignal(signal ?? dbSignal),
			{ signal, source: 'customersRepo.list' }
		);
		return (data ?? []).map(rowToCustomer);
	},

	/**
	 * Búsqueda por texto: si el query son 6+ dígitos, busca por teléfono exacto; si no, busca por dirección, entre calles o notas (ilike).
	 * Útil cuando la lista en memoria está vacía o no incluye el cliente.
	 */
	async search(query: string, signal?: AbortSignal): Promise<Customer[]> {
		const q = String(query ?? '').trim();
		if (!q) return [];
		const digits = q.replace(/\D/g, '');

		// Si hay 4+ dígitos: buscar todos los clientes cuyo teléfono contenga esa secuencia (p. ej. 44810780 muestra "44810780" y "01144810780")
		if (digits.length >= 4) {
			const phonePattern = `%${digits}%`;
			const byPhoneContains = await dbSelect<Row[]>(
				'customers',
				({ signal: dbSignal, client }) =>
					client
						.from('customers')
						.select('id, phone, address, between_streets, notes, created_at')
						.ilike('phone', phonePattern)
						.order('created_at', { ascending: false })
						.limit(50)
						.abortSignal(signal ?? dbSignal),
				{ signal, source: 'customersRepo.search.phoneContains' }
			);
			if (byPhoneContains.length > 0) return byPhoneContains.map(rowToCustomer);
		}

		// Búsqueda por texto en dirección, entre calles, notas y teléfono (ilike)
		const pattern = `%${q.replace(/"/g, '""')}%`;
		const quoted = `"${pattern}"`;
		const orFilter = `address.ilike.${quoted},between_streets.ilike.${quoted},notes.ilike.${quoted},phone.ilike.${quoted}`;
		const data = await dbSelect<Row[]>(
			'customers',
			({ signal: dbSignal, client }) =>
				client
					.from('customers')
					.select('id, phone, address, between_streets, notes, created_at')
					.or(orFilter)
					.order('created_at', { ascending: false })
					.limit(50)
					.abortSignal(signal ?? dbSignal),
			{ signal, source: 'customersRepo.search' }
		);
		return (data ?? []).map(rowToCustomer);
	},

	/**
	 * Búsqueda solo por teléfono: exacto y luego por coincidencia de dígitos (ilike).
	 * Sirve para la página Clientes cuando se busca solo por número (ej. 1128939337).
	 */
	async searchByPhoneOnly(phoneOrDigits: string, signal?: AbortSignal): Promise<Customer[]> {
		const raw = String(phoneOrDigits ?? '').trim();
		const digits = raw.replace(/\D/g, '');
		if (digits.length < 4) return [];

		const byExact = await this.findByPhone(raw, signal);
		if (byExact) return [byExact];
		if (digits !== raw) {
			const byDigits = await this.findByPhone(digits, signal);
			if (byDigits) return [byDigits];
		}

		const pattern = `%${digits}%`;
		const data = await dbSelect<Row[]>(
			'customers',
			({ signal: dbSignal, client }) =>
				client
					.from('customers')
					.select('id, phone, address, between_streets, notes, created_at')
					.ilike('phone', pattern)
					.order('created_at', { ascending: false })
					.limit(50)
					.abortSignal(signal ?? dbSignal),
			{ signal, source: 'customersRepo.searchByPhoneOnly' }
		);
		return (data ?? []).map(rowToCustomer);
	},

	/** Busca un cliente por teléfono (valor exacto, para resolver 409 al crear). */
	async findByPhone(phone: string, signal?: AbortSignal): Promise<Customer | null> {
		const value = String(phone ?? '').trim();
		if (!value) return null;
		const data = await dbSelect<Row[]>(
			'customers',
			({ signal: dbSignal, client }) =>
				client
					.from('customers')
					.select('id, phone, address, between_streets, notes, created_at')
					.eq('phone', value)
					.abortSignal(signal ?? dbSignal)
					.limit(1),
			{ signal, source: 'customersRepo.findByPhone' }
		);
		const row = Array.isArray(data) ? data[0] : null;
		return row ? rowToCustomer(row) : null;
	},

	async create(payload: Omit<Customer, 'id' | 'createdAt'>): Promise<Customer> {
		try {
			const data = await dbInsert<Row>(
				'customers',
				{
					phone: payload.phone,
					address: payload.address,
					between_streets: payload.betweenStreets?.trim() || null,
					notes: payload.notes?.trim() || null
				},
				({ signal, client, payload: row }) =>
					client
						.from('customers')
						.insert(row)
						.select('id, phone, address, between_streets, notes, created_at')
						.abortSignal(signal)
						.single(),
				{ source: 'customersRepo.create' }
			);
			return rowToCustomer(data);
		} catch (e) {
			// 409 Conflict = ya existe (ej. unique en phone); devolver el cliente existente
			const isConflict =
				e instanceof AppError &&
				(e.status === 409 || e.code === '23505' || (e.cause as { code?: string })?.code === '23505');
			if (isConflict && payload.phone) {
				let existing = await this.findByPhone(payload.phone);
				if (!existing) {
					const normalized = payload.phone.replace(/\D/g, '').trim();
					if (normalized) existing = await this.findByPhone(normalized);
				}
				if (existing) return existing;
			}
			throw e;
		}
	},

	async update(id: string, payload: Partial<Omit<Customer, 'id' | 'createdAt'>>): Promise<Customer | null> {
		const updates: Partial<Record<keyof Row, unknown>> = {};
		if (payload.phone !== undefined) updates.phone = payload.phone;
		if (payload.address !== undefined) updates.address = payload.address;
		if (payload.betweenStreets !== undefined) updates.between_streets = payload.betweenStreets?.trim() || null;
		if (payload.notes !== undefined) updates.notes = payload.notes?.trim() || null;

		if (Object.keys(updates).length === 0) {
			const data = await dbSelect<Row | null>(
				'customers',
				({ signal, client }) =>
					client
						.from('customers')
						.select('id, phone, address, between_streets, notes, created_at')
						.eq('id', id)
						.abortSignal(signal)
						.maybeSingle(),
				{ source: 'customersRepo.getById' }
			);
			return data ? rowToCustomer(data) : null;
		}

		const data = await dbUpdate<Row | null>(
			'customers',
			updates,
			{ id },
			({ signal, client, payload, match }) =>
				client
					.from('customers')
					.update(payload)
					.eq('id', match.id as string)
					.select('id, phone, address, between_streets, notes, created_at')
					.abortSignal(signal)
					.maybeSingle(),
			{ source: 'customersRepo.update' }
		);
		return data ? rowToCustomer(data) : null;
	},

	async remove(id: string): Promise<void> {
		await dbDelete(
			'customers',
			{ id },
			({ signal, client, match }) => client.from('customers').delete().eq('id', match.id as string).abortSignal(signal),
			{ source: 'customersRepo.remove' }
		);
	}
};

