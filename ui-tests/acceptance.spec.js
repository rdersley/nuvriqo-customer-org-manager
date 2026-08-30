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

  const iframeSelector = 'iframe[data-forge-iframe="true"], iframe[data-testid="hosted-resources-iframe"]';
  const iframe = page.locator(iframeSelector).first();
  await expect(iframe).toBeVisible({ timeout: 30000 });
  const manager = page.frameLocator(iframeSelector).first();
  await expect(manager.getByRole('heading', { name: 'Customers', exact: true })).toBeVisible({ timeout: 30000 });
  return manager;
}

test('Customer & Organisation Manager opens directly in Jira administration', async ({ page }) => {
  const manager = await openManager(page);
  await expect(manager.getByRole('button', { name: 'Customers', exact: true })).toBeVisible();
  await expect(manager.getByRole('button', { name: 'Organisations', exact: true })).toBeVisible();
  await expect(manager.getByRole('button', { name: 'Import', exact: true })).toBeVisible();
  await expect(manager.getByRole('button', { name: 'Import History', exact: true })).toBeVisible();
});

test('customer administration exposes working search controls', async ({ page }) => {
  const manager = await openManager(page);
  await expect(manager.getByPlaceholder('Search customers by name or email')).toBeVisible();
  await expect(manager.getByRole('button', { name: 'Search', exact: true })).toBeVisible();
  await expect(manager.getByRole('button', { name: 'Reset', exact: true })).toBeVisible();
});

test('organisation administration exposes search', async ({ page }) => {
  const manager = await openManager(page);
  await manager.getByRole('button', { name: 'Organisations', exact: true }).click();
  await expect(manager.getByRole('heading', { name: 'Organisations', exact: true })).toBeVisible();
  await expect(manager.getByPlaceholder('Search organisations')).toBeVisible();
});

test('import screen exposes Jira-aware preview workflow', async ({ page }) => {
  const manager = await openManager(page);
  await manager.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(manager.getByRole('heading', { name: 'Import', exact: true })).toBeVisible();
  await expect(manager.locator('body')).toContainText(/preview checks Jira before anything is changed/i);
  await expect(manager.locator('input[type="file"]')).toBeVisible();
});

test('large valid CSV is handled without per-row Jira lookup failure', async ({ page }) => {
  const manager = await openManager(page);
  await manager.getByRole('button', { name: 'Import', exact: true }).click();
  const csv = ['Email,Full Name,Organisation'];
  for (let i = 1; i <= 501; i += 1) csv.push(`qa-large-${i}@example.invalid,QA Large ${i},QA Organisation`);
  await manager.locator('input[type="file"]').setInputFiles({
    name: 'large-import-regression.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv.join('\n'))
  });
  await expect(manager.getByRole('heading', { name: 'Large import safety check', exact: true })).toBeVisible({ timeout: 30000 });
  await expect(manager.locator('body')).toContainText('501 valid rows were detected');
  await expect(manager.locator('body')).not.toContainText(/Atlassian API error 412|Preview failed/i);
  await expect(manager.getByRole('button', { name: /Import 0 customer changes/ })).toBeDisabled();
});

test('manager remains healthy at compact desktop width', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  const manager = await openManager(page);
  const dimensions = await manager.locator('html').evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 2);
});

test('manager keeps authenticated state after reload', async ({ page }) => {
  await openManager(page);
  const before = page.url();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectHealthy(page);
  await expect(page.getByText(managerName, { exact: true }).first()).toBeVisible();
  const iframeSelector = 'iframe[data-forge-iframe="true"], iframe[data-testid="hosted-resources-iframe"]';
  const iframe = page.locator(iframeSelector).first();
  await expect(iframe).toBeVisible({ timeout: 30000 });
  await expect(page.frameLocator(iframeSelector).first().getByRole('heading', { name: 'Customers', exact: true })).toBeVisible({ timeout: 30000 });
  expect(page.url()).toBe(before);
});
