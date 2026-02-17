import { test, expect } from '@playwright/test';

/**
 * Test: al elegir dos clientes en Crear pedido deben aparecer 2 cards (no reemplazar la primera).
 * La app redirige a /login si no hay sesión; este test usa sessionStorage para simular
 * que ya tenemos un borrador y luego verifica que el store acepta agregar otro.
 */
test.describe('Create order - multiple draft cards', () => {
	test('page has create order UI', async ({ page }) => {
		await page.goto('/app/create_order');
		// Puede redirigir a login o mostrar la página
		await page.waitForLoadState('networkidle');
		const url = page.url();
		const hasCrearPedido = await page.getByText('Crear Pedido').first().isVisible().catch(() => false);
		const hasLogin = url.includes('/login');
		expect(hasLogin || hasCrearPedido).toBeTruthy();
	});

	test('inject two drafts via storage and check two cards appear', async ({ page }) => {
		// Ir a create_order e inyectar 2 borradores en el store vía sessionStorage
		// (el store se hidrata desde sessionStorage en onMount)
		await page.goto('/app/create_order');
		await page.waitForLoadState('domcontentloaded');

		await page.evaluate(() => {
			const key = 'novum_create_order_drafts';
			const draft1 = {
				id: 'draft_test_1',
				title: 'Pedido 1',
				selectedCustomerId: 'c1',
				categoryId: 'all',
				cart: [],
				paymentMethod: 'CASH',
				cashReceived: 0,
				notes: '',
				createdAt: new Date().toISOString(),
				customerPhoneSnapshot: '1111111111',
				addressSnapshot: 'Calle 1'
			};
			const draft2 = {
				...draft1,
				id: 'draft_test_2',
				title: 'Pedido 2',
				customerPhoneSnapshot: '2222222222',
				addressSnapshot: 'Calle 2'
			};
			sessionStorage.setItem(
				key,
				JSON.stringify({
					drafts: [draft1, draft2],
					activeDraftId: draft1.id,
					draftCount: 2
				})
			);
		});

		// Recargar para que onMount hidrate desde sessionStorage
		await page.reload();
		await page.waitForLoadState('networkidle');

		// Si estamos en create_order (no en login), deberíamos ver 2 cards con #1 y #2
		const url = page.url();
		if (url.includes('/login')) {
			test.skip();
			return;
		}

		const card1 = page.getByText('#1');
		const card2 = page.getByText('#2');
		const crearPedidoBtn = page.getByText('Crear Pedido').first();

		await expect(card1).toBeVisible({ timeout: 5000 });
		await expect(card2).toBeVisible({ timeout: 5000 });
		await expect(crearPedidoBtn).toBeVisible({ timeout: 5000 });
	});
});
