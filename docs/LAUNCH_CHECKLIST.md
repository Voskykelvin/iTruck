# iTruck Launch Checklist

## 🚀 Critical Path to First Deploy (Do These First)

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
- [ ] Verify `.env` has Cloudinary ✅ (already done)
- [ ] Verify `.env` has JWT_SECRET ✅ (already done)

### Deploy (5 mins via Render)
- [ ] Push code to GitHub
- [ ] Create Render Web Service
- [ ] Connect GitHub repo
- [ ] Paste secrets into Render dashboard
- [ ] Click Deploy

### Test (15 mins)
- [ ] Visit `https://your-domain/app` → Should see React app
- [ ] Visit `https://your-domain/api/health` → Should return `200`
- [ ] Try register shipper → Should work
- [ ] Try register owner → Should work
- [ ] Try login → Should work

**Total time: ~1 hour to live.**

---

## 📋 Before You Go Live to Real Users

### Security
- [ ] HTTPS working (auto on Render)
- [ ] No console errors on frontend (check browser DevTools)
- [ ] No auth tokens in logs
- [ ] Database backups enabled

### Functionality
- [ ] Truck registration works (photo upload to Cloudinary)
- [ ] Booking creation works
- [ ] Owner bidding is blocked until owner and truck verification documents are approved
- [ ] POD or receiver confirmation upload works before delivery completion
- [ ] Delivery geofence blocks completion when destination coordinates exist and driver location is outside the allowed radius
- [ ] Admin payment release is blocked until delivery, escrow, and approved delivery proof are present
- [ ] LTL booking estimate returns shared-capacity pricing and route-cluster recommendation
- [ ] Marketplace cluster endpoint responds for authenticated users
- [ ] Notifications show (or fail gracefully)
- [ ] Admin dashboard loads

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

## 🔄 Optional Phase 2 (After You Have Users)

These can wait, use demo/fallback until ready:
- [ ] Stripe payment integration
- [ ] M-Pesa mobile money
- [ ] SMS notifications (Africa's Talking)
- [ ] Email confirmations (SendGrid)
- [ ] Maps (Google Maps API)
- [ ] WhatsApp/SMS-assisted driver workflow
- [ ] Full LTL dispatch allocation and multi-stop sequencing

---

## 📞 Support

Issues during deploy?
1. Check `DEPLOYMENT_GUIDE.md` troubleshooting section
2. Run `npm test` locally to confirm code is solid
3. Verify env vars are set correctly in Render dashboard
4. Check Render logs: `render logs itruck-api`

**Your Render.yaml is pre-configured** — it will handle build & start automatically.
