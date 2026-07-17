import { test, expect } from '@playwright/test';

async function login(page, email) {
  await page.goto('/login');
  const result = await page.evaluate(
    async ({ email }) => {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Device-Id': crypto.randomUUID() },
        body: JSON.stringify({ email, password: 'ChangeMeUser123!', deviceId: crypto.randomUUID() })
      });
      return { status: response.status, body: await response.json() };
    },
    { email }
  );
  expect(result.status).toBe(200);
}

test('shipper booking, owner bid, and acceptance stay visible and financially accurate', async ({ browser }) => {
  test.setTimeout(120_000);
  const suffix = Date.now().toString().slice(-6);
  const pickup = `Nairobi QA ${suffix}`;
  const destination = `Kampala QA ${suffix}`;

  const shipperContext = await browser.newContext();
  const shipper = await shipperContext.newPage();
  await login(shipper, 'shipper.one@example.com');

  const created = await shipper.evaluate(
    async ({ pickup, destination }) => {
      const csrf = document.cookie
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith('itruck_csrf='))
        ?.split('=')[1];
      const response = await fetch('/api/bookings', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': decodeURIComponent(csrf || ''),
          'X-Device-Id': crypto.randomUUID()
        },
        body: JSON.stringify({
          pickup,
          destination,
          distance: 660,
          border: 'Cross-border',
          vehicleType: 'Lorry',
          cargo: 'QA packaged food',
          weight: '8',
          requirements: 'Standard',
          cargoValue: 18000,
          receiverName: 'QA Receiver',
          receiverPhone: '+256700123456',
          paymentMethod: 'Wallet'
        })
      });
      return { status: response.status, body: await response.json() };
    },
    { pickup, destination }
  );
  expect(created.status).toBe(201);
  const bookingId = created.body.booking._id;

  const ownerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  await login(owner, 'owner.one@example.com');
  await owner.goto('/app/bids');
  const loadCard = owner.locator('.glass-card', { hasText: pickup });
  await expect(loadCard).toBeVisible();
  await loadCard.click();

  await owner.getByRole('button', { name: 'Submit Bid', exact: true }).click();
  await owner.getByLabel('Bid amount (USD)').fill('1450');
  await owner.getByLabel('Vehicle').selectOption({ index: 1 });
  await owner.getByLabel('Message to shipper').fill('Available for pickup tomorrow morning.');
  const bidResponse = owner.waitForResponse(
    (response) => response.url().endsWith(`/api/bookings/${bookingId}/bids`) && response.request().method() === 'POST'
  );
  await owner.getByRole('dialog').getByRole('button', { name: 'Submit Bid', exact: true }).click();
  expect((await bidResponse).ok()).toBe(true);

  await owner.goto('/app/shipments');
  await expect(owner.getByRole('tab', { name: /My Bids \(\d+\)/ })).toBeVisible();
  const ownerBidRow = owner.getByRole('row', { name: new RegExp(bookingId) });
  await expect(ownerBidRow).toBeVisible();
  await expect(ownerBidRow.getByText(/USD\s*1,450/)).toBeVisible();
  await expect(ownerBidRow.getByText('pending', { exact: true })).toBeVisible();

  await shipper.goto(`/app/shipments/${bookingId}`);
  await expect(shipper.getByText('Carrier Bids')).toBeVisible();
  await expect(shipper.getByText(/USD\s*1,450/)).toBeVisible();
  const acceptResponse = shipper.waitForResponse(
    (response) => response.url().endsWith('/accept') && response.request().method() === 'PATCH'
  );
  await shipper.getByRole('button', { name: 'Accept Bid', exact: true }).click();
  expect((await acceptResponse).ok()).toBe(true);

  await expect(shipper.getByText('Confirmed', { exact: true })).toBeVisible();
  await expect(shipper.getByText('Accepted Offer')).toBeVisible();
  await expect(shipper.getByText(/USD\s*1,450/).first()).toBeVisible();
  await expect(shipper.getByText('Payment pending')).toBeVisible();
  await expect(shipper.getByText('8 tonnes')).toBeVisible();
  await expect(shipper.getByText('Lorry', { exact: true })).toBeVisible();

  await shipper.getByRole('button', { name: 'Fund Escrow', exact: true }).click();
  await expect(shipper.getByRole('dialog').getByText(/USD\s*1,486\.25/)).toBeVisible();
  const fundingResponse = shipper.waitForResponse((response) =>
    response.url().endsWith(`/api/payments/bookings/${bookingId}/escrow`)
  );
  await shipper.getByRole('dialog').getByRole('button', { name: 'Fund Escrow', exact: true }).click();
  expect((await fundingResponse).ok()).toBe(true);
  await expect(shipper.getByText('Funded', { exact: true })).toBeVisible();

  await owner.goto(`/app/shipments/${bookingId}`);
  await expect(owner.getByRole('button', { name: 'Start Dispatch', exact: true })).toBeVisible();
  const dispatchResponse = owner.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/bookings/${bookingId}/status`) && response.request().method() === 'PATCH'
  );
  await owner.getByRole('button', { name: 'Start Dispatch', exact: true }).click();
  expect((await dispatchResponse).ok()).toBe(true);
  await expect(owner.getByText('In Transit', { exact: true })).toBeVisible();
  await expect(owner.getByText('Currently on route to destination')).toBeVisible();

  await shipper.goto(`/app/shipments/${bookingId}`);
  await expect(shipper.getByText('In Transit', { exact: true })).toBeVisible();
  const deliveryResponse = shipper.waitForResponse((response) =>
    response.url().endsWith(`/api/bookings/${bookingId}/confirm-delivery`)
  );
  await shipper.getByRole('button', { name: 'Confirm Receipt', exact: true }).click();
  expect((await deliveryResponse).ok()).toBe(true);
  await expect(shipper.getByText('Delivered', { exact: true })).toBeVisible();
  await expect(shipper.getByText('Shipment completed')).toBeVisible();
  await expect(shipper.getByText('Accepted Offer')).toBeVisible();
  await expect(shipper.getByText(/USD\s*1,450/).first()).toBeVisible();
  await expect(shipper.getByRole('button', { name: 'Invoice', exact: true })).toBeVisible();
  await expect(shipper.getByRole('button', { name: 'Proof of Delivery', exact: true })).toBeVisible();

  const releaseResponse = shipper.waitForResponse((response) =>
    response.url().endsWith(`/api/payments/bookings/${bookingId}/release`)
  );
  await shipper.getByRole('button', { name: 'Release Payment', exact: true }).click();
  expect((await releaseResponse).ok()).toBe(true);
  await expect(shipper.getByText('Released', { exact: true })).toBeVisible();

  await shipper.getByRole('button', { name: 'Leave a Review', exact: true }).click();
  await shipper.getByLabel('Comment (optional)').fill('Reliable carrier and clear delivery handoff.');
  const reviewResponse = shipper.waitForResponse((response) =>
    response.url().endsWith(`/api/bookings/${bookingId}/ratings`)
  );
  await shipper.getByRole('dialog').getByRole('button', { name: 'Submit Review', exact: true }).click();
  expect((await reviewResponse).ok()).toBe(true);
  await expect(shipper.getByRole('button', { name: 'Leave a Review', exact: true })).toHaveCount(0);

  await ownerContext.close();
  await shipperContext.close();
});
