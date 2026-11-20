import { test, expect } from '@playwright/test';

const ADMIN = { email: 'e2e-admin@example.com', password: 'E2e-Admin-Passw0rd!' };

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

test('rejects an invalid password with a readable message', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(ADMIN.email);
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Incorrect email or password')).toBeVisible();
});

test('signs in and shows live dashboard figures', async ({ page }) => {
  await login(page);
  await expect(page.getByText('Active customers', { exact: true })).toBeVisible();
  await expect(page.getByText('Completed assessments', { exact: true })).toBeVisible();
  // Seeded data is clearly labelled as demonstration data.
  await expect(page.getByText(/fictional/i).first()).toBeVisible();
});

test('creates a customer and opens its detail page', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Customers', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible();

  const uniqueName = `E2E Created Co ${Date.now()}`;
  await page.getByRole('link', { name: /New customer/ }).click();
  await page.getByLabel('Organisation name').fill(uniqueName);
  await page.getByLabel('Industry / sector').fill('E2E Testing');
  await page
    .getByLabel('Assessment scope / environment')
    .fill('Scoped for the end-to-end test run.');
  await page.getByRole('button', { name: 'Create customer' }).click();

  await expect(page.getByRole('heading', { name: uniqueName })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: uniqueName })).toBeVisible();
});

test('validates the customer form before submitting', async ({ page }) => {
  await login(page);
  await page.goto('/customers/new');
  await page.getByRole('button', { name: 'Create customer' }).click();
  await expect(page.getByText('Organization name is required')).toBeVisible();
  await expect(page.getByText('Industry is required')).toBeVisible();
});

test('opens a seeded assessment and shows provisional scoring information', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Assessments', exact: true }).click();
  await page.getByRole('row').filter({ hasText: 'ASM-0004' }).getByRole('link').first().click();

  await expect(page.getByRole('heading', { name: /ASM-0004/ })).toBeVisible();
  await expect(page.getByText('Provisional score')).toBeVisible();
  await expect(page.getByText(/Coverage:/)).toBeVisible();
  await expect(page.getByText('Control evaluation')).toBeVisible();
});

test('shows the remediation board columns with seeded findings', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Remediation board' }).click();
  await expect(page.getByRole('heading', { name: 'Remediation board' })).toBeVisible();
  await expect(page.getByText('Open', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Pending verification').first()).toBeVisible();
});
