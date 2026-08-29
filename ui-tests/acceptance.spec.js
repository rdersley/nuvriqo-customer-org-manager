const { test, expect } = require('@playwright/test');

const fatalError = /Something went wrong|Failed to load|Log in to continue|Internal server error|We can't find the page you're looking for|Error code:\s*404/i;
const managerName = 'Customer & Organisation Manager';

function baseUrl() {
  const base = process.env.JIRA_BASE_URL;
  expect(base).toBeTruthy();
  return base.replace(/\/$/, '');
}

async function expectHealthy(page) {
  await expect(page.locator('body')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(fatalError);
  await expect(page).not.toHaveURL(/login|id\.atlassian/i);
}

async function openJiraAdminApps(page) {
  await page.goto(`${baseUrl()}/jira/for-you`, { waitUntil: 'domcontentloaded' });
  await expectHealthy(page);

  const settings = page.getByRole('button', { name: 'Settings', exact: true }).first();
  await expect(settings).toBeVisible({ timeout: 20000 });
  await settings.click();

  const manageApps = page.getByRole('menuitem', { name: /Manage apps|Apps/i }).first();
  if (await manageApps.isVisible({ timeout: 5000 }).catch(() => false)) {
    await manageApps.click();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
  } else {
    const appsLink = page.getByRole('link', { name: /Manage apps|Apps/i }).first();
    await expect(appsLink).toBeVisible({ timeout: 10000 });
    await appsLink.click();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
  }

  await expectHealthy(page);
}

async function findManagerEntry(page) {
  await openJiraAdminApps(page);

  const appEntry = page.getByText(managerName, { exact: true }).first();
  await expect(appEntry).toBeVisible({ timeout: 30000 });
  return appEntry;
}

async function openManager(page) {
  const appEntry = await findManagerEntry(page);
  await appEntry.click();
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await expectHealthy(page);
}

test('authenticated Jira administration navigation is reachable', async ({ page }) => {
  await openJiraAdminApps(page);
  await expect(page.locator('body')).toContainText(/Apps|Manage apps/i);
});

test('Customer & Organisation Manager is exposed in Jira app administration', async ({ page }) => {
  await findManagerEntry(page);
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
  expect(page.url()).toBe(before);
});
