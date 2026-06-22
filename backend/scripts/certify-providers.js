require('dotenv').config({ path: require('path').join(__dirname, '../../.env.production') });
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const Stripe = require('stripe');
const { MpesaService, MTNMoMoService } = require('../services/payment');

const probe = process.argv.includes('--probe');
const checks = [];

function add(name, configured, detail) {
  checks.push({ name, configured: Boolean(configured), detail });
}

add('stripe.refunds', process.env.STRIPE_SECRET_KEY, 'Refund API');
add('stripe.payouts', process.env.STRIPE_SECRET_KEY, 'Connect transfer API');
add(
  'mpesa.refunds',
  process.env.MPESA_CONSUMER_KEY &&
    process.env.MPESA_CONSUMER_SECRET &&
    process.env.MPESA_REVERSAL_INITIATOR_NAME &&
    process.env.MPESA_REVERSAL_SECURITY_CREDENTIAL,
  'Daraja reversal API'
);
add(
  'mpesa.payouts',
  process.env.MPESA_CONSUMER_KEY &&
    process.env.MPESA_CONSUMER_SECRET &&
    process.env.MPESA_B2C_INITIATOR_NAME &&
    process.env.MPESA_B2C_SECURITY_CREDENTIAL,
  'Daraja B2C API'
);
add(
  'mtn.refunds',
  (process.env.MTN_MOMO_SUBSCRIPTION_KEY || process.env.MOMO_SUBSCRIBER_KEY) &&
    (process.env.MTN_MOMO_API_USER || process.env.MOMO_USER_ID) &&
    (process.env.MTN_MOMO_API_KEY || process.env.MOMO_API_KEY),
  'MoMo collection refund API'
);
add(
  'mtn.payouts',
  (process.env.MTN_MOMO_DISBURSEMENT_SUBSCRIPTION_KEY || process.env.MOMO_DISB_SUBSCRIBER_KEY) &&
    (process.env.MTN_MOMO_DISBURSEMENT_API_USER || process.env.MOMO_DISB_USER_ID) &&
    (process.env.MTN_MOMO_DISBURSEMENT_API_KEY || process.env.MOMO_DISB_API_KEY),
  'MoMo disbursement transfer API'
);
add(
  'email',
  process.env.EMAIL_PROVIDER_MODULE ||
    process.env.RESEND_API_KEY ||
    process.env.SENDGRID_API_KEY ||
    process.env.SMTP_URL ||
    process.env.SMTP_HOST,
  'Email provider'
);
add(
  'sms',
  process.env.SMS_PROVIDER_MODULE || (process.env.AFRICASTALKING_API_KEY && process.env.AFRICASTALKING_USERNAME),
  'SMS provider'
);
add(
  'web-push',
  process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT,
  'VAPID keys'
);
add('delivery-receipts', process.env.NOTIFICATION_RECEIPT_SECRET, 'Authenticated receipt callback');

(async () => {
  const probes = [];
  if (probe && process.env.STRIPE_SECRET_KEY) {
    try {
      await new Stripe(process.env.STRIPE_SECRET_KEY).balance.retrieve();
      probes.push({ name: 'stripe.authentication', passed: true });
    } catch (err) {
      probes.push({ name: 'stripe.authentication', passed: false, error: err.message });
    }
  }
  if (probe && process.env.MPESA_CONSUMER_KEY && process.env.MPESA_CONSUMER_SECRET) {
    try {
      await new MpesaService().accessToken();
      probes.push({ name: 'mpesa.authentication', passed: true });
    } catch (err) {
      probes.push({ name: 'mpesa.authentication', passed: false, error: err.message });
    }
  }
  if (probe && (process.env.MTN_MOMO_SUBSCRIPTION_KEY || process.env.MOMO_SUBSCRIBER_KEY)) {
    try {
      await new MTNMoMoService().accessToken('collection');
      probes.push({ name: 'mtn.collection.authentication', passed: true });
    } catch (err) {
      probes.push({ name: 'mtn.collection.authentication', passed: false, error: err.message });
    }
  }
  if (probe && (process.env.MTN_MOMO_DISBURSEMENT_SUBSCRIPTION_KEY || process.env.MOMO_DISB_SUBSCRIBER_KEY)) {
    try {
      await new MTNMoMoService().accessToken('disbursement');
      probes.push({ name: 'mtn.disbursement.authentication', passed: true });
    } catch (err) {
      probes.push({ name: 'mtn.disbursement.authentication', passed: false, error: err.message });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: probe ? 'authentication-probe' : 'configuration',
    checks,
    probes,
    configured: checks.every((check) => check.configured),
    probesPassed: probes.every((item) => item.passed)
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.configured || !report.probesPassed) process.exit(1);
})();
