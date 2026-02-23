import { dbSelect, dbInsert, dbUpdate } from '$lib/data/db';
import type { Shift } from '$lib/types';
import { generateId, isoNow } from '$lib/utils';

type ShiftRow = {
	id: string;
	opened_at: string;
	closed_at: string | null;
	turn: string;
	turn_number: number;
	cashier_staff_id: string;
	status: string;
	totals_by_payment: Record<string, number>;
	total: number;
};

const DEFAULT_TOTALS: Shift['totalsByPayment'] = { CASH: 0, MP: 0, TRANSFER: 0 };

function rowToShift(row: ShiftRow): Shift {
	return {
		id: row.id,
		openedAt: row.opened_at,
		closedAt: row.closed_at ?? undefined,
		turn: row.turn as Shift['turn'],
		turnNumber: row.turn_number,
		cashierStaffId: row.cashier_staff_id,
		status: row.status as 'OPEN' | 'CLOSED',
		totalsByPayment: (row.totals_by_payment as Shift['totalsByPayment']) ?? DEFAULT_TOTALS,
		total: Number(row.total)
	};
}

export const shiftsRepo = {
	async list(): Promise<Shift[]> {
		const rows = await dbSelect<ShiftRow[]>(
			'shifts',
			({ signal, client }) =>
				client
					.from('shifts')
					.select('id, opened_at, closed_at, turn, turn_number, cashier_staff_id, status, totals_by_payment, total')
					.order('opened_at', { ascending: false })
					.abortSignal(signal),
			{ source: 'shiftsRepo.list' }
		);
		return (rows ?? []).map(rowToShift);
	},

	async getOpen(): Promise<Shift | null> {
		const rows = await dbSelect<ShiftRow[]>(
			'shifts',
			({ signal, client }) =>
				client
					.from('shifts')
					.select('id, opened_at, closed_at, turn, turn_number, cashier_staff_id, status, totals_by_payment, total')
					.eq('status', 'OPEN')
					.order('opened_at', { ascending: false })
					.limit(1)
					.abortSignal(signal),
			{ source: 'shiftsRepo.getOpen' }
		);
		const row = rows?.[0];
		return row ? rowToShift(row) : null;
	},

	async open(
		payload: Omit<Shift, 'id' | 'openedAt' | 'status' | 'totalsByPayment' | 'total' | 'turnNumber'>
	): Promise<Shift> {
		const maxRows = await dbSelect<{ turn_number: number }[]>(
			'shifts',
			({ signal, client }) =>
				client.from('shifts').select('turn_number').order('turn_number', { ascending: false }).limit(1).abortSignal(signal),
			{ source: 'shiftsRepo.openMaxTurn' }
		);
		const nextTurnNumber = (maxRows?.[0]?.turn_number ?? 0) + 1;

		const row = await dbInsert<ShiftRow>(
			'shifts',
			{
				id: generateId('shf'),
				opened_at: isoNow(),
				closed_at: null,
				turn: payload.turn,
				turn_number: nextTurnNumber,
				cashier_staff_id: payload.cashierStaffId,
				status: 'OPEN',
				totals_by_payment: DEFAULT_TOTALS,
				total: 0
			},
			undefined,
			{ source: 'shiftsRepo.open' }
		);
		return rowToShift(row);
	},

	async close(
		id: string,
		totalsByPayment: Shift['totalsByPayment'],
		total: number
	): Promise<Shift | null> {
		const row = await dbUpdate<ShiftRow>(
			'shifts',
			{
				status: 'CLOSED',
				closed_at: isoNow(),
				totals_by_payment: totalsByPayment,
				total,
				updated_at: isoNow()
			},
			{ id },
			({ signal, client, payload, match }) =>
				client.from('shifts').update(payload).eq('id', match.id as string).select().abortSignal(signal).single(),
			{ source: 'shiftsRepo.close' }
		);
		return row ? rowToShift(row) : null;
	}
};
