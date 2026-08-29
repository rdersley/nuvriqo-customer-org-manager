const { test, expect } = require('@playwright/test');

const fatalError = /Something went wrong|Failed to load|Log in to continue|Internal server error/i;

function baseUrl() {
  const base = process.env.JIRA_BASE_URL;
  expect(base).toBeTruthy();
  return base.replace(/\/$/, '');
}

async function expectHealthy(page) {
  await expect(page.locator('body')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(fatalError);
}

async function openManager(page) {
  await page.goto(`${baseUrl()}/jira/settings/apps`, { waitUntil: 'domcontentloaded' });
  await expectHealthy(page);
  const appEntry = page.getByText('Customer & Organisation Manager', { exact: true }).first();
  await expect(appEntry).toBeVisible({ timeout: 25000 });
  await appEntry.click();
  await page.waitForLoadState('domcontentloaded');
  await expectHealthy(page);
}

test('authenticated Jira administration surface is reachable', async ({ page }) => {
  await page.goto(`${baseUrl()}/jira/settings/apps`, { waitUntil: 'domcontentloaded' });
  await expectHealthy(page);
  await expect(page).not.toHaveURL(/login|id\.atlassian/i);
});

test('Customer & Organisation Manager is exposed in Jira app settings', async ({ page }) => {
  await page.goto(`${baseUrl()}/jira/settings/apps`, { waitUntil: 'domcontentloaded' });
  await expectHealthy(page);
  await expect(page.getByText('Customer & Organisation Manager', { exact: true }).first()).toBeVisible({ timeout: 25000 });
});

test('Customer & Organisation Manager opens to its administration UI', async ({ page }) => {
  await openManager(page);
  await expect(page.locator('body')).toContainText(/Customer/i);
  await expect(page.locator('body')).toContainText(/Organisation/i);
});

test('manager UI exposes usable administration controls', async ({ page }) => {
  await openManager(page);
  const controls = page.locator('button, input, select, textarea, [role="button"], [role="combobox"]');
  expect(await controls.count()).toBeGreaterThan(0);
});

test('manager remains healthy at compact desktop width', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await openManager(page);
  const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 2);
});

test('manager keeps authenticated Jira state after reload', async ({ page }) => {
  await openManager(page);
  const before = page.url();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectHealthy(page);
  await expect(page).not.toHaveURL(/login|id\.atlassian/i);
  expect(page.url()).toBe(before);
});
