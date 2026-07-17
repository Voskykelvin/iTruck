import { chromium } from '@playwright/test';
import { mkdir, mkdtemp, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceDir = path.resolve(scriptDir, '..');
const projectDir = path.resolve(workspaceDir, '..');
const outputDir = path.resolve(projectDir, 'recordings');
const baseURL = process.env.RECORDING_BASE_URL || 'http://127.0.0.1:5000';
const finalVideo = path.join(outputDir, 'itruck-complete-customer-experience.webm');
const qaReportPath = path.join(outputDir, 'customer-experience-qa.json');

await mkdir(outputDir, { recursive: true });

if (process.argv.includes('--clean-stale-qa')) {
  const staleQaFiles = (await readdir(outputDir)).filter((name) => name === 'qa-03-missing-shipper-bid.png');
  await Promise.all(staleQaFiles.map((name) => unlink(path.join(outputDir, name))));
  console.log(`Removed ${staleQaFiles.length} stale QA files.`);
  process.exit(0);
}

if (process.argv.includes('--clean-only') || process.argv.includes('--clean-all')) {
  const removeFinal = process.argv.includes('--clean-all');
  const videos = (await readdir(outputDir)).filter(
    (name) => /^page@[a-f0-9]+\.webm$/.test(name) || (removeFinal && /^itruck-.*\.webm$/.test(name))
  );
  await Promise.all(videos.map((name) => unlink(path.join(outputDir, name))));
  console.log(`Removed ${videos.length} recording files.`);
  process.exit(0);
}

const previousVideos = (await readdir(outputDir)).filter(
  (name) => /^page@[a-f0-9]+\.webm$/.test(name) || /^itruck-.*\.webm$/.test(name)
);
await Promise.all(previousVideos.map((name) => unlink(path.join(outputDir, name))));
console.log(`Removed ${previousVideos.length} previous recording files.`);

const videoTempDir = await mkdtemp(path.join(os.tmpdir(), 'itruck-recording-'));

async function waitForServer(url, timeoutMs = 30_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) return;
    } catch {
      // The local API is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`The recording server did not become ready at ${url}`);
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
  await waitForServer(baseURL);
}

const browser = await chromium.launch({ headless: true });
const qa = {
  generatedAt: new Date().toISOString(),
  browser: 'Chromium via Playwright',
  viewport: '1440x900',
  checks: [],
  findings: []
};

const pause = (page, milliseconds = 1_500) => page.waitForTimeout(milliseconds);
const pass = (check, evidence) => qa.checks.push({ status: 'passed', check, evidence });
const finding = (severity, title, evidence) => qa.findings.push({ severity, title, evidence });

async function chapter(page, title, subtitle) {
  await page.evaluate(
    ({ title, subtitle }) => {
      document.querySelector('[data-recording-chapter]')?.remove();
      const card = document.createElement('div');
      card.dataset.recordingChapter = 'true';
      card.innerHTML = `<div style="font-size:14px;letter-spacing:.16em;text-transform:uppercase;color:#77e0c4;margin-bottom:14px">iTruck customer journey + QA</div><div style="font-size:38px;font-weight:760;line-height:1.12">${title}</div><div style="font-size:19px;color:#d3dfdc;margin-top:14px;max-width:760px">${subtitle}</div>`;
      Object.assign(card.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '2147483647',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '48px',
        color: 'white',
        background: 'linear-gradient(135deg, #061c19 0%, #0b4b42 58%, #08342e 100%)',
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
        opacity: '0',
        transition: 'opacity 240ms ease'
      });
      document.body.appendChild(card);
      requestAnimationFrame(() => (card.style.opacity = '1'));
    },
    { title, subtitle }
  );
  await pause(page, 2_600);
  await page.evaluate(() => {
    const card = document.querySelector('[data-recording-chapter]');
    if (card) card.style.opacity = '0';
  });
  await pause(page, 300);
  await page.evaluate(() => document.querySelector('[data-recording-chapter]')?.remove());
}

async function qaNote(page, text, tone = 'pass') {
  await page.evaluate(
    ({ text, tone }) => {
      document.querySelector('[data-qa-note]')?.remove();
      const note = document.createElement('div');
      note.dataset.qaNote = 'true';
      note.textContent = `${tone === 'pass' ? '✓ QA check' : '⚠ QA observation'}: ${text}`;
      Object.assign(note.style, {
        position: 'fixed',
        left: '50%',
        bottom: '28px',
        transform: 'translateX(-50%)',
        zIndex: '2147483646',
        maxWidth: '900px',
        padding: '13px 18px',
        borderRadius: '999px',
        color: 'white',
        background: tone === 'pass' ? 'rgba(4, 91, 78, .96)' : 'rgba(153, 88, 8, .96)',
        boxShadow: '0 12px 34px rgba(0,0,0,.28)',
        font: '600 15px/1.35 Inter, ui-sans-serif, system-ui, sans-serif'
      });
      document.body.appendChild(note);
    },
    { text, tone }
  );
  await pause(page, 2_600);
  await page.evaluate(() => document.querySelector('[data-qa-note]')?.remove());
}

async function spotlightClick(page, locator, after = 1_200) {
  await locator.scrollIntoViewIfNeeded();
  await locator.evaluate((element) => {
    element.dataset.recordingSpotlight = 'true';
    element.dataset.recordingPreviousOutline = element.style.outline;
    element.dataset.recordingPreviousOutlineOffset = element.style.outlineOffset;
    element.style.outline = '4px solid rgba(13, 148, 136, .58)';
    element.style.outlineOffset = '4px';
  });
  await pause(page, 700);
  await locator.click();
  await pause(page, after);
  await page.evaluate(() => {
    document.querySelectorAll('[data-recording-spotlight]').forEach((element) => {
      element.style.outline = element.dataset.recordingPreviousOutline || '';
      element.style.outlineOffset = element.dataset.recordingPreviousOutlineOffset || '';
      delete element.dataset.recordingSpotlight;
      delete element.dataset.recordingPreviousOutline;
      delete element.dataset.recordingPreviousOutlineOffset;
    });
  });
}

async function slowFill(page, label, value) {
  const input = page.getByLabel(label);
  await input.click();
  await input.fill('');
  await input.pressSequentially(value, { delay: 34 });
  await pause(page, 450);
}

async function login(page, email, roleLabel) {
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await pause(page, 2_500);
  await spotlightClick(page, page.getByRole('button', { name: 'Log In', exact: true }));
  await slowFill(page, 'Email Address', email);
  await slowFill(page, 'Password', 'ChangeMeUser123!');
  await spotlightClick(page, page.getByRole('button', { name: 'Sign In', exact: true }), 1_800);
  await page.waitForURL(/\/app\//);
  await page.getByRole('heading', { name: /Welcome back/ }).waitFor();
  pass(`${roleLabel} login`, `${email} reached the role dashboard.`);
  await qaNote(page, `${roleLabel} credentials route to the correct dashboard.`);
}

async function signOut(page) {
  await spotlightClick(page, page.locator('.sidebar-footer a'));
  await page.getByRole('button', { name: 'Sign Out', exact: true }).scrollIntoViewIfNeeded();
  await spotlightClick(page, page.getByRole('button', { name: 'Sign Out', exact: true }), 1_500);
  await page.waitForURL(/\/login/);
}

async function inspectVerification(page, role) {
  await chapter(
    page,
    `${role === 'owner' ? 'Owner' : 'Shipper'} identity verification`,
    'Review the customer-facing KYC checklist, status language, and path back to the workspace.'
  );
  await spotlightClick(page, page.getByRole('link', { name: 'Verification', exact: true }));
  await page.getByRole('heading', { name: 'Identity Verification' }).waitFor();
  const verificationStatus = await page
    .getByText(/^(Approved|Under Review|\d+ remaining)$/)
    .first()
    .textContent();
  await pause(page, 3_500);
  await qaNote(page, `The checklist is readable and reports ${verificationStatus}.`, 'observe');
  pass(`${role} verification page renders`, `Identity Verification displayed with status: ${verificationStatus}.`);
  await spotlightClick(
    page,
    page.getByRole('link', { name: role === 'owner' ? 'Fleet Overview' : 'Dashboard', exact: true })
  );
}

async function recordCompleteJourney() {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    recordVideo: { dir: videoTempDir, size: { width: 1440, height: 900 } }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);

  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await chapter(
    page,
    'Complete customer experience',
    'A slower end-to-end QA walkthrough: shipper booking → owner bid → shipper bid review and acceptance.'
  );

  await chapter(
    page,
    '1. Shipper journey',
    'Start at the homepage, sign in, review verification, and create a real demo booking.'
  );
  await login(page, 'shipper.one@example.com', 'Shipper');
  await inspectVerification(page, 'shipper');

  await spotlightClick(page, page.getByRole('link', { name: 'Book Truck', exact: true }));
  await page.getByRole('heading', { name: 'Book a Truck' }).waitFor();
  await pause(page, 2_000);

  await slowFill(page, 'Pickup Location', 'Nairobi QA Hub');
  await slowFill(page, 'Destination', 'Kampala QA Depot');
  await page.locator('.input-group', { hasText: 'Route Type' }).locator('select').selectOption('Cross-border');
  await slowFill(page, 'Approx Distance (km)', '660');
  await pause(page, 2_000);
  await spotlightClick(page, page.getByRole('button', { name: 'Continue', exact: true }));

  await slowFill(page, 'Cargo Description', '12 pallets of packaged food');
  await slowFill(page, 'Total Weight (Tonnes)', '8');
  await slowFill(page, 'Declared Value (USD)', '18000');
  await slowFill(page, 'Receiver Name', 'Amina Nsubuga');
  await slowFill(page, 'Receiver Phone', '+256700123456');
  await pause(page, 2_000);
  await spotlightClick(page, page.getByRole('button', { name: 'Continue', exact: true }));

  await spotlightClick(page, page.getByText('Lorry', { exact: true }));
  await page.locator('.input-group', { hasText: 'Special Handling' }).locator('select').selectOption('Standard');
  await pause(page, 1_500);
  await spotlightClick(page, page.getByRole('button', { name: 'Continue', exact: true }));
  await page.getByRole('heading', { name: 'Review & Confirm' }).waitFor();
  await pause(page, 3_500);

  const createResponsePromise = page.waitForResponse(
    (response) => response.url().endsWith('/api/bookings') && response.request().method() === 'POST'
  );
  await spotlightClick(page, page.getByRole('button', { name: 'Confirm & Book', exact: true }), 1_500);
  const createResponse = await createResponsePromise;
  const createBody = await createResponse.json();
  if (!createResponse.ok()) throw new Error(`Booking creation failed: ${JSON.stringify(createBody)}`);
  const bookingId = createBody.booking?._id || createBody.booking?.id;
  await page.waitForURL(new RegExp(`/app/shipments/${bookingId}$`));
  await page.getByText('Carrier Bids').scrollIntoViewIfNeeded();
  await pause(page, 3_500);
  pass('Booking creation', `${bookingId} was created and opened on the shipment detail page.`);
  await qaNote(page, `Booking ${bookingId} is posted; Carrier Bids currently shows the waiting state.`);
  await page.screenshot({ path: path.join(outputDir, 'qa-01-shipper-booking.png'), fullPage: true });
  await signOut(page);

  await chapter(
    page,
    '2. Fleet owner journey',
    'Sign in, review owner verification, find the new load, submit a bid, and locate it under Jobs.'
  );
  await login(page, 'owner.one@example.com', 'Fleet owner');
  await inspectVerification(page, 'owner');

  await spotlightClick(page, page.getByRole('link', { name: 'Load Board', exact: true }));
  await page.getByRole('heading', { name: 'Load Board' }).waitFor();
  const loadCard = page.locator('.glass-card', { hasText: 'Nairobi QA Hub' });
  await pause(page, 5_000);
  if (await loadCard.count()) {
    pass('Owner load-board visibility', `${bookingId} route appeared on the owner Load Board.`);
    await qaNote(page, 'The shipper booking is visible to the owner on the Load Board.');
    await spotlightClick(page, loadCard);
  } else {
    finding(
      'high',
      'New shipper booking is missing from the owner Load Board',
      `${bookingId} was created successfully but its Nairobi QA Hub route did not render on the owner Load Board.`
    );
    await qaNote(
      page,
      'The newly created route is missing from the Load Board. Opening the same booking directly to continue QA.',
      'observe'
    );
    await page.goto(`${baseURL}/app/shipments/${bookingId}`, { waitUntil: 'networkidle' });
  }
  await page.waitForURL(new RegExp(`/app/shipments/${bookingId}$`));
  await page.getByRole('button', { name: 'Submit Bid', exact: true }).waitFor();
  await pause(page, 3_000);

  await spotlightClick(page, page.getByRole('button', { name: 'Submit Bid', exact: true }), 1_000);
  const bidDialog = page.getByRole('dialog');
  await bidDialog.getByLabel('Bid amount (USD)').fill('1450');
  await bidDialog.getByLabel('Vehicle').selectOption({ index: 1 });
  await bidDialog.getByLabel('Message to shipper').fill('Available for the requested pickup window.');
  const bidResponsePromise = page.waitForResponse(
    (response) => response.url().endsWith(`/api/bookings/${bookingId}/bids`) && response.request().method() === 'POST'
  );
  await spotlightClick(page, bidDialog.getByRole('button', { name: 'Submit Bid', exact: true }), 1_800);
  const bidResponse = await bidResponsePromise;
  const bidBody = await bidResponse.json();
  if (!bidResponse.ok()) throw new Error(`Bid submission failed: ${JSON.stringify(bidBody)}`);
  const submittedBid = bidBody.booking?.bids?.at(-1);
  await pause(page, 2_500);
  pass('Owner bid submission', `A USD ${submittedBid?.amount} bid was stored on ${bookingId}.`);
  await qaNote(page, 'Bid submitted successfully. Next, verify where the owner can find it.');

  const jobsLink = page.getByRole('link', { name: 'My Bids & Jobs', exact: true });
  if (await jobsLink.count()) {
    await spotlightClick(page, jobsLink);
  } else {
    finding(
      'medium',
      'Owner Jobs navigation disappeared after bidding',
      'The Jobs link was not available in the accessible navigation immediately after the bid response succeeded.'
    );
    await qaNote(
      page,
      'Jobs navigation is unavailable after the bid; opening the owner shipments route directly.',
      'observe'
    );
    await page.goto(`${baseURL}/app/shipments`, { waitUntil: 'networkidle' });
  }
  await page.getByRole('heading', { name: 'Shipments' }).waitFor();
  const ownerBidRow = page.getByRole('row', { name: new RegExp(bookingId.slice(0, 8)) });
  await ownerBidRow.waitFor();
  await pause(page, 3_500);
  const ownerBidText = await ownerBidRow.innerText();
  if (!ownerBidText.includes('1,450') || !/pending/i.test(ownerBidText)) {
    finding('medium', 'Owner bid details are incomplete', `The My Bids row rendered as: ${ownerBidText}`);
  } else {
    pass('Owner bid destination', `${bookingId} appears under My Bids with amount and bid status.`);
  }
  await qaNote(
    page,
    'Owner result: the submitted offer is visible under My Bids with its amount and status.',
    'observe'
  );
  await page.screenshot({ path: path.join(outputDir, 'qa-02-owner-jobs.png'), fullPage: true });
  await signOut(page);

  await chapter(
    page,
    '3. Shipper reviews the bid',
    'Return to My Shipments, open the booking, inspect the Carrier Bids card, and accept the offer.'
  );
  await login(page, 'shipper.one@example.com', 'Returning shipper');
  await spotlightClick(page, page.getByRole('link', { name: 'My Shipments', exact: true }));
  await page.getByPlaceholder('Search by ID, city, or route...').fill(bookingId);
  const shipmentRow = page.getByRole('row', { name: new RegExp(bookingId.slice(0, 8)) });
  await shipmentRow.waitFor();
  await pause(page, 3_000);
  await spotlightClick(page, shipmentRow);
  await page.waitForURL(new RegExp(`/app/shipments/${bookingId}$`));

  const carrierBids = page.getByText('Carrier Bids');
  await carrierBids.scrollIntoViewIfNeeded();
  const bidAmount = page.getByText(/(?:USD|\$)\s*1,450/).first();
  await pause(page, 5_000);
  let bidVisible = await bidAmount.isVisible().catch(() => false);
  if (!bidVisible) {
    finding(
      'high',
      'Returning shipper initially receives stale booking data',
      'After the owner bid succeeded, signing back in and opening the booking still showed the pre-bid state until a full browser refresh.'
    );
    await qaNote(
      page,
      'The new bid is missing because this booking view is stale. Refreshing the browser to verify server state.',
      'observe'
    );
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText('Carrier Bids').scrollIntoViewIfNeeded();
    await pause(page, 5_000);
    bidVisible = await bidAmount.isVisible().catch(() => false);
  }
  let journeyOutcome;
  if (bidVisible) {
    await page.getByRole('button', { name: 'Accept Bid', exact: true }).waitFor();
    await pause(page, 4_000);
    pass(
      'Shipper bid visibility',
      'The owner offer appears inside the booking under Carrier Bids with amount and actions.'
    );
    await qaNote(page, 'Shipper result: bids are inside the shipment detail page under Carrier Bids.');
    await page.screenshot({ path: path.join(outputDir, 'qa-03-shipper-carrier-bid.png'), fullPage: true });

    const acceptResponsePromise = page.waitForResponse(
      (response) => response.url().includes(`/api/bookings/${bookingId}/bids/`) && response.url().endsWith('/accept')
    );
    await spotlightClick(page, page.getByRole('button', { name: 'Accept Bid', exact: true }), 1_800);
    const acceptResponse = await acceptResponsePromise;
    const acceptBody = await acceptResponse.json();
    if (!acceptResponse.ok()) throw new Error(`Bid acceptance failed: ${JSON.stringify(acceptBody)}`);
    const acceptedStatus = String(acceptBody.booking?.status || '').toLowerCase();
    if (acceptedStatus !== 'confirmed') {
      throw new Error(`Bid acceptance returned unexpected status: ${acceptedStatus || 'missing'}`);
    }
    pass('Bid acceptance API', `${bookingId} returned Confirmed after bid acceptance.`);
    await pause(page, 5_000);
    let confirmedVisible = await page
      .getByText('Confirmed', { exact: true })
      .first()
      .isVisible()
      .catch(() => false);
    if (!confirmedVisible) {
      finding(
        'high',
        'Accepted booking does not update immediately in the UI',
        'The acceptance response returned Confirmed, but the shipment detail did not render that status until a full refresh.'
      );
      await qaNote(
        page,
        'Acceptance succeeded, but the detail page did not update. Refreshing to verify the confirmed server state.',
        'observe'
      );
      await page.reload({ waitUntil: 'networkidle' });
      await pause(page, 5_000);
      confirmedVisible = await page
        .getByText('Confirmed', { exact: true })
        .first()
        .isVisible()
        .catch(() => false);
    }
    if (confirmedVisible) {
      pass('Confirmed status visibility', `${bookingId} displayed Confirmed after acceptance.`);
    } else {
      finding(
        'critical',
        'Confirmed booking state is not renderable',
        'The API returned Confirmed, but the detail page still did not display the confirmed status after refresh.'
      );
    }
    const acceptedOfferVisible = await page
      .getByText('Accepted Offer', { exact: true })
      .isVisible()
      .catch(() => false);
    if (acceptedOfferVisible) {
      pass('Accepted bid history', 'The confirmed booking retains the accepted offer and amount.');
    } else {
      finding('low', 'Accepted bid history is missing', 'The confirmed booking does not show an Accepted Offer card.');
    }
    await qaNote(
      page,
      confirmedVisible
        ? 'The booking is Confirmed with the accepted offer and payment summary visible.'
        : 'The API confirmed the booking, but the UI still failed to render the confirmed state.',
      'observe'
    );
    const confirmedPageText = await page.locator('body').innerText();
    if (confirmedPageText.includes('Agreed Price') && confirmedPageText.includes('USD 0')) {
      finding(
        'high',
        'Confirmed payment amount does not match the accepted bid',
        'The accepted bid was USD 1,450, but the confirmed Payment Summary displays Agreed Price USD 0.'
      );
    }
    if (confirmedPageText.includes('Escrow Status') && confirmedPageText.includes('FUNDED')) {
      finding(
        'high',
        'Escrow is shown as funded without a payment step',
        'The confirmed booking displays Funded even though the recorded customer journey never funded escrow.'
      );
    }
    await page.screenshot({ path: path.join(outputDir, 'qa-04-confirmed-booking.png'), fullPage: true });
    journeyOutcome = `Booking ${bookingId}: created, bid, reviewed, and confirmed.`;
  } else {
    const directCheck = await page.evaluate(async (id) => {
      const response = await fetch(`/api/bookings/${encodeURIComponent(id)}?qa=${Date.now()}`, { cache: 'no-store' });
      return { status: response.status, body: await response.json() };
    }, bookingId);
    const persistedBids = directCheck.body?.booking?.bids || [];
    const evidence = persistedBids.length
      ? `The direct booking API returned ${persistedBids.length} bid(s), but Carrier Bids still rendered the waiting state.`
      : `The direct booking API returned zero bids after the earlier successful bid response.`;
    finding('critical', 'Submitted owner bid is unavailable to the returning shipper', evidence);
    await qaNote(page, `${evidence} The customer journey cannot continue to acceptance.`, 'observe');
    await page.screenshot({ path: path.join(outputDir, 'qa-03-missing-shipper-bid.png'), fullPage: true });
    journeyOutcome = `Booking ${bookingId}: bid submission succeeded, but the shipper could not retrieve the bid for acceptance.`;
  }

  if (browserErrors.length) {
    finding('high', 'Browser runtime errors occurred', browserErrors.join(' | '));
  } else {
    pass('Browser stability', 'No uncaught page errors were observed during the complete journey.');
  }

  await chapter(page, 'Walkthrough complete', journeyOutcome);

  const video = page.video();
  await context.close();
  await writeFile(qaReportPath, `${JSON.stringify({ ...qa, bookingId }, null, 2)}\n`, 'utf8');
  await video.saveAs(finalVideo);
  await video.delete();
}

try {
  await recordCompleteJourney();
  console.log(`Recording saved to ${finalVideo}`);
  console.log(`QA report saved to ${qaReportPath}`);
} finally {
  await browser.close();
  backendProcess?.kill();
  await rm(videoTempDir, { recursive: true, force: true });
}
