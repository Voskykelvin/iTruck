# iTruck Launch Checklist

## Critical Path to First Deploy (Do These First)

### Prep (30 mins)

- [ ] Get production MongoDB URI (MongoDB Atlas cloud or self-hosted)
  - Format: `mongodb+srv://username:password@cluster.mongodb.net/itruck`
  - Test locally first: `mongosh "your-uri"`
- [ ] Register domain or use Render's auto-domain
  - Example: `itruck.onrender.com` or `api.itruck.africa`

### Environment Setup (10 mins)

- [ ] Copy `.env.production` template
- [ ] Fill in these 3 fields minimum:
  ```
  MONGODB_URI=mongodb+srv://...
  FRONTEND_URL=https://your-domain
  ALLOWED_ORIGINS=https://your-domain
  ```
- [ ] Verify `.env` has Cloudinary configured
- [ ] Verify `.env` has JWT_SECRET configured

### Deploy (5 mins via Render)

- [ ] Push code to GitHub
- [ ] Create Render Web Service
- [ ] Connect GitHub repo
- [ ] Paste secrets into Render dashboard
- [ ] Click Deploy

### Test (15 mins)

- [ ] Visit `https://your-domain/app` and confirm the React app loads
- [ ] Visit `https://your-domain/api/health` and confirm it returns `200`
- [ ] Try register shipper and confirm it works
- [ ] Try register owner and confirm it works
- [ ] Try login and confirm it works

**Total time: ~1 hour to live.**

---

## Before You Go Live to Real Users

### Security

- [ ] HTTPS working (auto on Render)
- [ ] No console errors on frontend (check browser DevTools)
- [ ] No auth tokens in logs
- [ ] Database backups enabled
- [ ] Production dependency audits pass for backend and workspace
- [ ] Socket connections reject unauthenticated clients and unauthorized booking-room joins

### Functionality

- [ ] Truck registration works (photo upload to Cloudinary)
- [ ] Renamed or MIME-spoofed uploads are rejected
- [ ] Documents cannot be approved without uploaded or generated evidence
- [ ] Public truck endpoints do not expose owner identity, registration, chassis, or document records
- [ ] Booking creation works
- [ ] Owner bidding is blocked until owner and truck verification documents are approved
- [ ] POD or receiver confirmation upload works before delivery completion
- [ ] Delivery geofence blocks completion when destination coordinates exist and driver location is outside the allowed radius
- [ ] Owner live GPS starts only on assigned confirmed/in-transit jobs
- [ ] Tracking points appear for the shipper without a page refresh
- [ ] Offline driver tracking queues points and syncs them when the network returns
- [ ] Admin payment release is blocked until delivery, escrow, and approved delivery proof are present
- [ ] LTL booking estimate returns shared-capacity pricing and route-cluster recommendation
- [ ] Marketplace cluster endpoint responds for authenticated users
- [ ] In-app notifications show and realtime events arrive
- [ ] Email/SMS booking events respect preferences and quiet hours
- [ ] Notification provider failures are retried and visible to operators
- [ ] Admin dashboard loads
- [ ] Issue reports can be assigned, investigated, escalated, resolved, and reopened
- [ ] Receiver acceptance captures an e-signature or OTP plus evidence metadata
- [ ] Route view calculates road ETA and route deviation from live GPS

### Operations

- [ ] Understand how to view logs (Render dashboard)
- [ ] Know how to scale (Render: upgrade plan)
- [ ] Have rollback plan (keep git tag, can redeploy old version)

### Communication

- [ ] Privacy policy live
- [ ] Terms of service live
- [ ] Support email active
- [ ] Team knows launch date

---

## Provider And Phase 2 Work

Payment adapter code exists, but real-money launch still requires provider credentials,
sandbox/live certification, callback monitoring, refund/dispute handling, and owner payout
execution.

- [ ] Certify Stripe payment and webhook flows with a live account
- [ ] Certify M-Pesa and MTN MoMo collection/callback flows
- [ ] Implement and certify owner payouts, refunds, and disputes
- [ ] Wire booking events to Africa's Talking SMS and certify delivery
- [ ] Wire booking events to Resend, SendGrid, or SMTP email and certify delivery
- [ ] Add routing/geocoding, live markers, road polylines, ETA, and deviation alerts
- [ ] Add user notification preferences, quiet hours, retries, and web push
- [ ] WhatsApp/SMS-assisted driver workflow
- [ ] Dedicated driver accounts, vehicle assignment, and job-scoped permissions
- [ ] Full support/dispute case lifecycle with SLA and resolution history
- [ ] Receiver e-signature or OTP and immutable evidence metadata
- [ ] Counteroffers, bid withdrawal/expiry, rejection reasons, and carrier acknowledgement
- [ ] Replace placeholder auto-assignment with verified-truck ranking and assignment
- [ ] Full LTL dispatch allocation and multi-stop sequencing

---

## Support

Issues during deploy?

1. Check `DEPLOYMENT_GUIDE.md` troubleshooting section
2. Run `npm test` locally to confirm code is solid
3. Verify env vars are set correctly in Render dashboard
4. Check Render logs: `render logs itruck-api`

**Your Render.yaml is pre-configured** - it will handle build and start automatically.
