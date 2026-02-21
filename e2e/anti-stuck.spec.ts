import { expect, test, type Page } from '@playwright/test';

async function skipIfLogin(page: Page): Promise<boolean> {
	await page.waitForLoadState('domcontentloaded');
	const url = page.url();
	if (url.includes('/login')) {
		test.skip();
		return true;
	}
	return false;
}

test.describe('POS anti-stuck smoke', () => {
	test('products page stays interactive', async ({ page }) => {
		await page.goto('/app/products');
		if (await skipIfLogin(page)) return;

		await expect(page.getByRole('button', { name: /nuevo producto/i })).toBeVisible({
			timeout: 10_000
		});
		await expect(page.getByText('Guardando…')).toHaveCount(0);
	});

	test('groups page stays interactive', async ({ page }) => {
		await page.goto('/app/groups');
		if (await skipIfLogin(page)) return;

		await expect(page.getByRole('button', { name: /nuevo grupo/i })).toBeVisible({
			timeout: 10_000
		});
		await expect(page.getByText('Guardando…')).toHaveCount(0);
	});

	test('create order page renders without blocking spinner', async ({ page }) => {
		await page.goto('/app/create_order');
		if (await skipIfLogin(page)) return;

		await expect(page.getByText(/crear pedido/i).first()).toBeVisible({ timeout: 10_000 });
		await expect(page.getByText('Guardando…')).toHaveCount(0);
	});
});
