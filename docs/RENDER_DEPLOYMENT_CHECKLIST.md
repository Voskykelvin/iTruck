# iTruck Render Deployment Checklist

## 📋 Pre-Deployment (Do These First)

- [ ] Confirm GitHub repo is up to date
  - Run: `git status` → Should show "nothing to commit"
  - Run: `git push` → Confirm latest changes are on main branch
- [ ] Confirm you have all credentials ready:
  - [ ] MongoDB URI: `mongodb+srv://USER:PASSWORD@HOST/itruck?appName=APP`
  - [ ] JWT Secret: `paste-a-strong-32-character-secret`
  - [ ] Cloudinary Cloud: `your-cloud-name`
  - [ ] Cloudinary Key: `your-api-key`
  - [ ] Cloudinary Secret: `your-api-secret`
  - [ ] Google Maps API: `your-google-maps-api-key`

---

## 🚀 Render Deployment Steps

### Step 1: Create Render Account

1. Go to **https://render.com**
2. Click **Sign up**
3. Choose **Sign up with GitHub**
4. Click **Authorize render-inc** (authorizes Render to access your GitHub)
5. Complete signup → You're in the dashboard

### Step 2: Create Web Service

1. Click **New +** (top right)
2. Select **Web Service**
3. Choose **Build and deploy from a Git repository**
4. Click **Connect GitHub**
5. Select your GitHub account
6. Find and click **iTruck** repo
7. Click **Connect**

### Step 3: Configure Service Settings

**Name:** `itruck-api` (or any name you prefer)

**Environment:** `Node`

**Build Command:** Leave as default (Render will use `render.yaml`)

**Start Command:** Leave as default (Render will use `render.yaml`)

**Branch:** `main`

**Auto-deploy:** Toggle **ON** (redeploys on every GitHub push)

### Step 4: Add Environment Secrets

This is **critical** — if secrets are wrong, deployment fails.

Scroll down to **Environment Variables** section.

Click **Add Environment Variable** for each:

#### Required Secrets (7 total)

**1. MONGODB_URI**

- Key: `MONGODB_URI`
- Value: `mongodb+srv://USER:PASSWORD@HOST/itruck?appName=APP`
- ⚠️ **Copy your Render/MongoDB value exactly, including special characters**

**2. JWT_SECRET**

- Key: `JWT_SECRET`
- Value: `paste-a-strong-32-character-secret`

**3. CLOUDINARY_CLOUD_NAME**

- Key: `CLOUDINARY_CLOUD_NAME`
- Value: `your-cloud-name`

**4. CLOUDINARY_API_KEY**

- Key: `CLOUDINARY_API_KEY`
- Value: `your-api-key`

**5. CLOUDINARY_API_SECRET**

- Key: `CLOUDINARY_API_SECRET`
- Value: `your-api-secret`

**6. FRONTEND_URL**

- Key: `FRONTEND_URL`
- Value: `https://itruck-api.onrender.com` (Render will assign your URL after deploy)
- **Note:** Update this after deployment with your actual Render domain

**7. ALLOWED_ORIGINS**

- Key: `ALLOWED_ORIGINS`
- Value: `https://itruck-api.onrender.com` (same as FRONTEND_URL)

#### Optional Secrets (leave blank for now, but good to know)

These can be added later in Phase 2:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `REDIS_URL`
- `MPESA_*` credentials

### Step 5: Review & Deploy

1. Scroll to bottom
2. Click **Create Web Service** (big blue button)
3. Render starts building — **watch the logs**

**You should see:**

```
Building iTruck...
Installing dependencies...
Running build command...
✓ Build successful
Starting application...
Listening on port 5000
```

### Step 6: Wait for Deployment

**Timeline:**

- Initial build: 1-2 minutes
- Deployment: 30-60 seconds
- Total: ~2-3 minutes

**You'll see a green checkmark** next to the service when live.

---

## ✅ Post-Deployment Verification

### Step 1: Get Your Live URL

1. In Render dashboard, find your service (`itruck-api`)
2. Look for **URL** — something like: `https://itruck-api-abc123.onrender.com`
3. Copy this URL

### Step 2: Update FRONTEND_URL

Your initial FRONTEND_URL was placeholder. Update it:

1. In Render dashboard, click your service
2. Click **Environment** tab
3. Find `FRONTEND_URL`
4. Click **Edit** → Change value to your actual URL
5. Click **Save** → Redeploys automatically

### Step 3: Test Live App

Open in browser:

```
https://itruck-api-abc123.onrender.com/app
```

You should see:

- ✅ React app loads
- ✅ Homepage displays
- ✅ Can click "Book" or "Register Fleet"

### Step 4: Test API Health

Open in browser:

```
https://itruck-api-abc123.onrender.com/api/health
```

You should see JSON response:

```json
{ "status": "ok", "mode": "live", "database": "connected" }
```

### Step 5: Test Registration

1. Go to `https://your-domain/app`
2. Click **"Book a Truck"** or **"Register Fleet"**
3. Fill form and submit
4. Should register successfully (or show validation error)
5. If successful, user is in MongoDB ✅

### Step 6: Test Image Upload

1. Register as **Fleet Owner**
2. Go to **Add Truck**
3. Upload a photo
4. Should upload to Cloudinary (not fail)
5. Photo appears with truck listing ✅

---

## 🐛 Troubleshooting

### "Build Failed" or "Deployment Failed"

**Check logs:**

1. Click service in Render
2. Click **Logs** tab
3. Look for red errors

**Common issues:**

- `MONGODB_URI` is wrong → Check password includes dots/special chars
- `JWT_SECRET` too short → Must be 32+ chars
- `render.yaml` not found → Confirm it's in root of repo

**Fix:** Update secret in Render → Redeploy (click **Redeploy** button)

### "Cannot connect to MongoDB"

**Possible causes:**

- IP not whitelisted in MongoDB Atlas
- Database credentials wrong
- Network timeout

**Fix:**

1. Go to MongoDB Atlas → Network Access
2. Add `0.0.0.0/0` (allow all IPs)
3. Test connection from Render logs
4. Redeploy service

### "Maps not showing" / "Blank page"

- Google Maps API key might be invalid
- Check `VITE_GOOGLE_MAPS_API_KEY` is set in .env
- Fallback placeholder should show if key invalid (not blank)

### "Photos not uploading"

- Check Cloudinary credentials are correct in Render
- Verify API key isn't disabled in Cloudinary dashboard
- Check file size < 12MB (Nginx limit)

---

## 📊 Monitoring After Launch

### Daily Checks

- [ ] Visit homepage — loads fast
- [ ] Register test account — works
- [ ] Try login — works
- [ ] Check Render logs for errors

### Weekly Checks

- [ ] Monitor Render dashboard for memory/CPU usage
- [ ] Check error logs in Render
- [ ] Verify database isn't full (MongoDB quota)

### Monthly Tasks

- [ ] Rotate JWT_SECRET if compromised
- [ ] Update dependencies for security patches
- [ ] Backup MongoDB

---

## 🎉 You're Live!

Once verified, you now have:

- ✅ Live production API at: `https://itruck-api-*.onrender.com`
- ✅ React app at: `https://itruck-api-*.onrender.com/app`
- ✅ Real MongoDB database
- ✅ Image uploads to Cloudinary
- ✅ Maps (Google Maps API)
- ✅ Real-time notifications (Socket.io)
- ✅ All middleware (auth, validation, rate limiting)

**Next phase:**

- Invite beta users
- Monitor for bugs
- Gather feedback
- Plan Phase 2 (payments, SMS)

---

## 📞 Support Links

- **Render Docs:** https://render.com/docs
- **Node.js on Render:** https://render.com/docs/deploy-node
- **MongoDB Atlas:** https://www.mongodb.com/cloud/atlas
- **iTruck Docs:** See `docs/` folder in your repo

**Questions?** Check the logs first — they usually tell you exactly what's wrong.
