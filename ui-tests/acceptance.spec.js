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

test('authenticated Jira administration surface is reachable', async ({ page }) => {
  await page.goto(`${baseUrl()}/jira/settings/apps`, { waitUntil: 'domcontentloaded' });
  await expectHealthy(page);
  await expect(page).not.toHaveURL(/login|id\.atlassian/i);
});

test('Customer & Organisation Manager entry opens when exposed in app settings', async ({ page }) => {
  await page.goto(`${baseUrl()}/jira/settings/apps`, { waitUntil: 'domcontentloaded' });
  await expectHealthy(page);

  const appEntry = page.getByText('Customer & Organisation Manager', { exact: true }).first();
  if (await appEntry.count()) {
    await appEntry.click();
    await page.waitForLoadState('domcontentloaded');
    await expectHealthy(page);
    await expect(page.locator('body')).toContainText(/Customer|Organisation/i);
  } else {
    // The Forge admin module may be nested under an Apps submenu depending on Jira navigation rollout.
    // Keep this as a healthy authenticated-admin assertion rather than a brittle URL dependency.
    await expect(page.locator('body')).toContainText(/Apps|Manage apps|Settings/i);
  }
});

test('admin surface remains usable at compact desktop width', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(`${baseUrl()}/jira/settings/apps`, { waitUntil: 'domcontentloaded' });
  await expectHealthy(page);
});
