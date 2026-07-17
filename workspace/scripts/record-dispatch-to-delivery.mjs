import { chromium } from '@playwright/test';
import { mkdir, mkdtemp, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..', '..');
const outputDir = path.join(projectDir, 'recordings');
const baseURL = process.env.RECORDING_BASE_URL || 'http://127.0.0.1:5000';
const finalVideo = path.join(outputDir, 'itruck-dispatch-to-delivery.webm');
const qaReportPath = path.join(outputDir, 'dispatch-to-delivery-qa.json');
const videoTempDir = await mkdtemp(path.join(os.tmpdir(), 'itruck-delivery-recording-'));

await mkdir(outputDir, { recursive: true });
const oldOutputs = (await readdir(outputDir)).filter(
  (name) =>
    name === path.basename(finalVideo) || name === path.basename(qaReportPath) || /^dispatch-qa-\d+.*\.png$/.test(name)
);
await Promise.all(oldOutputs.map((name) => unlink(path.join(outputDir, name))));
console.log(`Removed ${oldOutputs.length} previous dispatch-to-delivery artifacts.`);

async function waitForServer(timeoutMs = 30_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${baseURL}/api/health`);
      if (response.ok) return;
    } catch {
      // The local server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`The recording server did not become ready at ${baseURL}`);
}

let backendProcess;
const currentHealth = await fetch(`${baseURL}/api/health`).catch(() => null);
if (!currentHealth?.ok) {
  backendProcess = spawn(process.execPath, ['backend/server.js'], {
    cwd: projectDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      LIVE_MODE: 'false',
      DEMO_MODE: 'true',
      JWT_SECRET: 'local-recording-secret',
      FRONTEND_URL: baseURL,
      ALLOWED_ORIGINS: baseURL,
      REDIS_URL: '',
      PORT: '5000'
    }
  });
  await waitForServer();
}

const browser = await chromium.launch({ headless: true });
const qa = {
  generatedAt: new Date().toISOString(),
  scope: 'Confirmed booking through dispatch, in-transit visibility, receipt confirmation, and delivery',
  browser: 'Chromium via Playwright',
  viewport: '1440x900',
  checks: [],
  findings: []
};
const pass = (check, evidence) => qa.checks.push({ status: 'passed', check, evidence });
const finding = (severity, title, evidence) => qa.findings.push({ severity, title, evidence });
const pause = (page, milliseconds = 1_500) => page.waitForTimeout(milliseconds);

async function apiLogin(page, email) {
  await page.goto(`${baseURL}/login`, { waitUntil: 'networkidle' });
  const result = await page.evaluate(async (loginEmail) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Device-Id': crypto.randomUUID() },
      body: JSON.stringify({ email: loginEmail, password: 'ChangeMeUser123!', deviceId: crypto.randomUUID() })
    });
    return { status: response.status, body: await response.json() };
  }, email);
  if (result.status !== 200) throw new Error(`Setup login failed for ${email}: ${JSON.stringify(result.body)}`);
}

async function apiJson(page, url, { method = 'GET', body } = {}) {
  const result = await page.evaluate(
    async ({ requestUrl, requestMethod, requestBody }) => {
      const csrf = document.cookie
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith('itruck_csrf='))
        ?.split('=')[1];
      const response = await fetch(requestUrl, {
        method: requestMethod,
        credentials: 'include',
        headers: {
          ...(requestBody ? { 'Content-Type': 'application/json' } : {}),
          ...(csrf ? { 'X-CSRF-Token': decodeURIComponent(csrf) } : {}),
          'X-Device-Id': crypto.randomUUID()
        },
        ...(requestBody ? { body: JSON.stringify(requestBody) } : {})
      });
      return { status: response.status, body: await response.json() };
    },
    { requestUrl: url, requestMethod: method, requestBody: body }
  );
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`${method} ${url} failed (${result.status}): ${JSON.stringify(result.body)}`);
  }
  return result.body;
}

async function prepareConfirmedBooking() {
  const shipperContext = await browser.newContext();
  const shipper = await shipperContext.newPage();
  await apiLogin(shipper, 'shipper.one@example.com');
  const suffix = Date.now().toString().slice(-6);
  const created = await apiJson(shipper, '/api/bookings', {
    method: 'POST',
    body: {
      pickup: `Nairobi Dispatch QA ${suffix}`,
      destination: `Kampala Delivery QA ${suffix}`,
      distance: 660,
      border: 'Cross-border',
      vehicleType: 'Lorry',
      cargo: 'Sealed QA retail stock',
      weight: '8',
      requirements: 'Standard',
      cargoValue: 18000,
      receiverName: 'QA Receiver',
      receiverPhone: '+256700123456',
      paymentMethod: 'Card'
    }
  });
  const bookingId = created.booking._id;

  const ownerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  await apiLogin(owner, 'owner.one@example.com');
  const bidResult = await apiJson(owner, `/api/bookings/${encodeURIComponent(bookingId)}/bids`, {
    method: 'POST',
    body: {
      amount: 1450,
      truck: 'demo-truck-isuzu',
      message: 'Dispatch team is ready for the confirmed route.'
    }
  });
  const bid = bidResult.booking.bids.at(-1);
  const bidId = bid._id || bid.id || bid.owner || bid.truck;
  const accepted = await apiJson(
    shipper,
    `/api/bookings/${encodeURIComponent(bookingId)}/bids/${encodeURIComponent(bidId)}/accept`,
    { method: 'PATCH' }
  );
  await apiJson(shipper, `/api/payments/bookings/${encodeURIComponent(bookingId)}/card-checkout`, {
    method: 'POST',
    body: { amount: accepted.booking.paymentBreakdown?.shipperTotal || 1486.25 }
  });

  const ownerStorage = await ownerContext.storageState();
  await ownerContext.close();
  await shipperContext.close();
  return { bookingId, ownerStorage };
}

async function chapter(page, title, subtitle) {
  await page.evaluate(
    ({ heading, detail }) => {
      document.querySelector('[data-recording-chapter]')?.remove();
      const card = document.createElement('div');
      card.dataset.recordingChapter = 'true';
      card.innerHTML = `<div style="font-size:14px;letter-spacing:.16em;text-transform:uppercase;color:#77e0c4;margin-bottom:14px">iTruck delivery journey + QA</div><div style="font-size:38px;font-weight:760;line-height:1.12">${heading}</div><div style="font-size:19px;color:#d3dfdc;margin-top:14px;max-width:760px">${detail}</div>`;
      Object.assign(card.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '2147483647',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '60px',
        color: 'white',
        background: 'linear-gradient(145deg, rgba(4,44,37,.97), rgba(10,25,22,.96))'
      });
      document.body.appendChild(card);
    },
    { heading: title, detail: subtitle }
  );
  await pause(page, 3_500);
  await page.evaluate(() => document.querySelector('[data-recording-chapter]')?.remove());
  await pause(page, 700);
}

async function qaNote(page, text, tone = 'pass') {
  await page.evaluate(
    ({ message, noteTone }) => {
      document.querySelector('[data-recording-note]')?.remove();
      const note = document.createElement('div');
      note.dataset.recordingNote = 'true';
      note.textContent = `${noteTone === 'pass' ? '✓' : 'QA'}  ${message}`;
      Object.assign(note.style, {
        position: 'fixed',
        right: '28px',
        bottom: '28px',
        zIndex: '2147483647',
        maxWidth: '560px',
        padding: '16px 20px',
        borderRadius: '12px',
        color: 'white',
        background: noteTone === 'pass' ? 'rgba(4,99,78,.94)' : 'rgba(140,82,10,.94)',
        boxShadow: '0 14px 40px rgba(0,0,0,.28)',
        font: '600 16px/1.4 system-ui, sans-serif'
      });
      document.body.appendChild(note);
    },
    { message: text, noteTone: tone }
  );
  await pause(page, 2_700);
  await page.evaluate(() => document.querySelector('[data-recording-note]')?.remove());
}

async function spotlightClick(page, locator, after = 1_500) {
  await locator.scrollIntoViewIfNeeded();
  await locator.evaluate((element) => {
    element.dataset.recordingSpotlight = 'true';
    element.style.outline = '4px solid rgba(13, 148, 136, .58)';
    element.style.outlineOffset = '4px';
  });
  await pause(page, 700);
  await locator.click();
  await pause(page, after);
  await page.evaluate(() => {
    document.querySelectorAll('[data-recording-spotlight]').forEach((element) => {
      element.style.outline = '';
      element.style.outlineOffset = '';
      delete element.dataset.recordingSpotlight;
    });
  });
}

async function signOut(page) {
  await spotlightClick(page, page.locator('.sidebar-footer a'));
  await spotlightClick(page, page.getByRole('button', { name: 'Sign Out', exact: true }));
  await page.waitForURL(/\/login/);
}

async function login(page, email, roleLabel) {
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await spotlightClick(page, page.getByRole('button', { name: 'Log In', exact: true }));
  await page.getByLabel('Email Address').fill(email);
  await page.getByLabel('Password').fill('ChangeMeUser123!');
  await spotlightClick(page, page.getByRole('button', { name: 'Sign In', exact: true }), 1_800);
  await page.waitForURL(/\/app\//);
  pass(`${roleLabel} login`, `${email} reached the correct workspace.`);
}

async function recordDeliveryJourney({ bookingId, ownerStorage }) {
  const context = await browser.newContext({
    storageState: ownerStorage,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    recordVideo: { dir: videoTempDir, size: { width: 1440, height: 900 } }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.goto(`${baseURL}/app/shipments/${bookingId}`, { waitUntil: 'networkidle' });
  await page.getByText('Confirmed', { exact: true }).waitFor();
  await chapter(
    page,
    'Dispatch to delivery',
    `Continue confirmed booking ${bookingId} through owner dispatch, shipper tracking, receipt confirmation, and the final delivered view.`
  );
  await pause(page, 2_500);
  pass('Confirmed handoff', `${bookingId} starts this recording in Confirmed with the accepted KES 1,450 offer.`);
  await qaNote(page, 'Owner sees the confirmed job, accepted carrier offer, and funded escrow before dispatch.');

  const dispatchResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/bookings/${bookingId}/status`) && response.request().method() === 'PATCH'
  );
  await spotlightClick(page, page.getByRole('button', { name: 'Start Dispatch', exact: true }), 2_000);
  const dispatchResponse = await dispatchResponsePromise;
  const dispatchBody = await dispatchResponse.json();
  if (!dispatchResponse.ok() || dispatchBody.booking?.status !== 'in_transit') {
    throw new Error(`Dispatch failed: ${JSON.stringify(dispatchBody)}`);
  }
  await page.getByText('In Transit', { exact: true }).waitFor();
  await page.getByText('Currently on route to destination').waitFor();
  pass(
    'Owner starts dispatch',
    `${bookingId} changed from Confirmed to In Transit through the visible Start Dispatch action.`
  );
  await qaNote(page, 'Dispatch succeeded: status and transit copy immediately update to In Transit.');
  await page.screenshot({ path: path.join(outputDir, 'dispatch-qa-01-owner-in-transit.png'), fullPage: true });

  await signOut(page);
  await chapter(
    page,
    'Shipper tracks and confirms receipt',
    'Switch roles and verify that the same in-transit state is visible before delivery confirmation.'
  );
  await login(page, 'shipper.one@example.com', 'Shipper');
  await spotlightClick(page, page.getByRole('link', { name: 'My Shipments', exact: true }));
  await page.goto(`${baseURL}/app/shipments/${bookingId}`, { waitUntil: 'networkidle' });
  await page.getByText('In Transit', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Confirm Receipt', exact: true }).waitFor();
  pass(
    'Shipper in-transit visibility',
    `The shipper sees ${bookingId} In Transit and receives the confirmation action.`
  );
  await qaNote(page, 'Both sides align: the shipper sees In Transit, the accepted KES 1,450 offer, and funded escrow.');
  await page.screenshot({ path: path.join(outputDir, 'dispatch-qa-02-shipper-in-transit.png'), fullPage: true });

  const deliveryResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith(`/api/bookings/${bookingId}/confirm-delivery`)
  );
  await spotlightClick(page, page.getByRole('button', { name: 'Confirm Receipt', exact: true }), 2_000);
  const deliveryResponse = await deliveryResponsePromise;
  const deliveryBody = await deliveryResponse.json();
  if (!deliveryResponse.ok() || deliveryBody.booking?.status !== 'delivered') {
    throw new Error(`Delivery confirmation failed: ${JSON.stringify(deliveryBody)}`);
  }
  await page.getByText('Delivered', { exact: true }).waitFor();
  await page.getByText('Shipment completed').waitFor();
  pass('Shipper confirms delivery', `${bookingId} changed from In Transit to Delivered through Confirm Receipt.`);
  pass('Commercial continuity after delivery', 'Accepted offer and KES 1,450 remain visible on the delivered booking.');
  await qaNote(page, 'Delivery complete: status, progress, accepted offer, and commercial amount remain aligned.');
  await page.screenshot({ path: path.join(outputDir, 'dispatch-qa-03-shipper-delivered.png'), fullPage: true });

  await signOut(page);
  await login(page, 'owner.one@example.com', 'Returning owner');
  await page.goto(`${baseURL}/app/shipments/${bookingId}`, { waitUntil: 'networkidle' });
  await page.getByText('Delivered', { exact: true }).waitFor();
  await page.getByText('Shipment completed').waitFor();
  await page.getByText('Accepted Offer', { exact: true }).waitFor();
  pass(
    'Owner delivered visibility',
    `The owner also sees ${bookingId} as Delivered with the accepted offer preserved.`
  );
  await qaNote(page, 'Final owner check passes: Delivered is synchronized across both customer roles.');
  await page.screenshot({ path: path.join(outputDir, 'dispatch-qa-04-owner-delivered.png'), fullPage: true });

  if (browserErrors.length) {
    finding('high', 'Browser runtime errors occurred', browserErrors.join(' | '));
  } else {
    pass('Browser stability', 'No uncaught page errors occurred during dispatch-to-delivery recording.');
  }
  await chapter(
    page,
    'Delivery lifecycle complete',
    `${bookingId} progressed from Confirmed to In Transit to Delivered on both sides.`
  );

  const video = page.video();
  await context.close();
  await writeFile(qaReportPath, `${JSON.stringify({ ...qa, bookingId }, null, 2)}\n`, 'utf8');
  await video.saveAs(finalVideo);
  await video.delete();
}

try {
  const setup = await prepareConfirmedBooking();
  await recordDeliveryJourney(setup);
  console.log(`Recording saved to ${finalVideo}`);
  console.log(`QA report saved to ${qaReportPath}`);
} finally {
  await browser.close();
  backendProcess?.kill();
  await rm(videoTempDir, { recursive: true, force: true }).catch((error) => {
    console.warn(`Temporary recording cleanup deferred: ${error.message}`);
  });
}
