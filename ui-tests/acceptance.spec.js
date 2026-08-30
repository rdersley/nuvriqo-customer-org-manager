const { test, expect } = require('@playwright/test');

const fatalError = /Something went wrong|Failed to load|Log in to continue|Internal server error|We can't find the page you're looking for|Error code:\s*404/i;
const managerName = 'Customer & Organisation Manager';

function baseUrl() {
  const base = process.env.JIRA_BASE_URL;
  expect(base).toBeTruthy();
  return base.replace(/\/$/, '');
}

function appUrl() {
  const appId = process.env.FORGE_APP_ID || 'ef946f9f-5a25-47d1-96ca-b1a11530f57c';
  const environmentId = process.env.FORGE_ENVIRONMENT_ID || '792afed1-f185-49b8-8bb3-e876d93a698c';
  return `${baseUrl()}/jira/settings/apps/${appId}/${environmentId}`;
}

async function expectHealthy(page) {
  await expect(page.locator('body')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(fatalError);
  await expect(page).not.toHaveURL(/login|id\.atlassian/i);
}

async function openManager(page) {
  await page.goto(appUrl(), { waitUntil: 'domcontentloaded' });
  await expectHealthy(page);
  await expect(page.getByText(managerName, { exact: true }).first()).toBeVisible({ timeout: 30000 });
}

test('Customer & Organisation Manager opens directly in Jira administration', async ({ page }) => {
  await openManager(page);
  await expect(page.locator('body')).toContainText('Customers');
  await expect(page.locator('body')).toContainText('Organisations');
  await expect(page.locator('body')).toContainText('Import');
  await expect(page.locator('body')).toContainText('Import History');
});

test('customer administration exposes working search controls', async ({ page }) => {
  await openManager(page);
  await expect(page.getByPlaceholder('Search customers by name or email')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset', exact: true })).toBeVisible();
});

test('organisation administration exposes search', async ({ page }) => {
  await openManager(page);
  await page.getByRole('button', { name: 'Organisations', exact: true }).click();
  await expect(page.getByPlaceholder('Search organisations')).toBeVisible();
});

test('import screen exposes Jira-aware preview workflow', async ({ page }) => {
  await openManager(page);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.locator('body')).toContainText(/preview checks Jira before anything is changed/i);
  await expect(page.locator('input[type="file"]')).toBeVisible();
});

test('manager remains healthy at compact desktop width', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await openManager(page);
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 2);
});

test('manager keeps authenticated state after reload', async ({ page }) => {
  await openManager(page);
  const before = page.url();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectHealthy(page);
  await expect(page.getByText(managerName, { exact: true }).first()).toBeVisible();
  expect(page.url()).toBe(before);
});
