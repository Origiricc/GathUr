import { expect, test } from '@playwright/test';

test('signed-out home page renders the hero', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'Find your people.' })).toBeVisible();
	await expect(page.getByText('Find a group')).toBeVisible();
});
