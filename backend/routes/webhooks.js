const express = require('express');
const Stripe = require('stripe');
const logger = require('../config/logger');

const stripeRouter = express.Router();

stripeRouter.post('/', (req, res, next) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!webhookSecret || !secretKey) {
    const err = new Error('Stripe webhook is not configured');
    err.status = 503;
    return next(err);
  }

  const signature = req.headers['stripe-signature'];
  if (!signature) {
    return res.status(400).json({ message: 'Missing Stripe signature' });
  }

  try {
    const stripe = new Stripe(secretKey);
    const event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
    logger.info({ eventId: event.id, eventType: event.type }, 'Stripe webhook verified');

    return res.json({ received: true });
  } catch (err) {
    logger.warn({ err }, 'Stripe webhook signature verification failed');
    return res.status(400).json({ message: 'Invalid webhook signature' });
  }
});

module.exports = { stripeRouter };
