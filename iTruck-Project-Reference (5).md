# iTruck — Project Reference Document
**Africa's Premium Logistics Platform**
*Saved from conversation — Full-stack build notes*

---

## 🚛 Project Overview

**iTruck** is a commercial logistics platform connecting truck owners and clients across all 54 African nations. It supports matatus, lorries, trailers, and buses for any distance across the continent. The design philosophy is **premium dark UI**, African-road-optimised, and mobile-ready.

---

## 📁 Complete File Structure

```
itruck/
├── frontend/
│   ├── index.html                  ✅ Homepage + dual signup modals
│   ├── manifest.json               ✅ PWA manifest (icons, shortcuts, display)
│   ├── sw.js                       ✅ Service Worker (cache, push, background sync)
│   ├── pages/
│   │   ├── dashboard-client.html   ✅ Client dashboard (4 sections)
│   │   ├── dashboard-owner.html    ✅ Owner dashboard (7 sections)
│   │   ├── book-truck.html         ✅ 5-step booking wizard
│   │   ├── tracking.html           ✅ Live GPS tracking
│   │   ├── listings.html           ✅ Browse & filter trucks
│   │   ├── profile.html            ✅ Profile (6 tabs)
│   │   └── admin/
│   │       └── admin-dashboard.html ✅ Admin panel (10 sections)
│   ├── css/
│   │   ├── styles.css              ✅ Global design system
│   │   ├── dashboard.css           ✅ Dashboard shared styles
│   │   ├── tracking.css            ✅ Tracking page styles
│   │   ├── listings.css            ✅ Listings page styles
│   │   ├── booking.css             ✅ Booking wizard styles
│   │   ├── profile.css             ✅ Profile page styles
│   │   └── admin.css               ✅ Admin panel styles
│   └── js/
│       ├── main.js                 ✅ Homepage logic
│       ├── dashboard-client.js     ✅ Client dashboard logic
│       ├── dashboard-owner.js      ✅ Owner dashboard logic
│       ├── tracking.js             ✅ Live tracking + chat
│       ├── listings.js             ✅ Filter/sort/search trucks
│       ├── booking.js              ✅ 5-step wizard logic
│       ├── profile.js              ✅ Profile tabs + forms
│       ├── admin.js                ✅ Admin panel logic
│       ├── socket-client.js        ✅ Socket.io client class (iTruckSocket)
│       ├── maps.js                 ✅ Mapbox full integration (iTruckMaps)
│       ├── pwa.js                  ✅ PWA install/update/offline logic
│       ├── api.js                  ✅ Complete typed API client (iTruckAPI singleton)
│       ├── auth-guard.js           ✅ Route protection + role-based redirects
│       ├── notifications-ui.js     ✅ Floating notification panel (NotificationsUI class)
│       └── rating.js               ✅ Star rating component + auto-open on delivery
├── backend/
│   ├── server.js                   ✅ Final production version (graceful shutdown, all routes)
│   ├── socket/
│   │   └── index.js                ✅ Redis-backed Socket.io (GPS, chat history, bids, presence)
│   ├── models/
│   │   ├── User.js                 ✅ Client & owner schema
│   │   ├── Truck.js                ✅ Vehicle schema
│   │   ├── Booking.js              ✅ Booking + bids + tracking
│   │   ├── Transaction.js          ✅ Payment transaction log
│   │   └── Notification.js         ✅ 23 notification types, TTL, channels, priority
│   ├── routes/
│   │   ├── auth.js                 ✅ Register (owner/client) + login
│   │   ├── bookings.js             ✅ CRUD + bid + accept + rate
│   │   ├── trucks.js               ✅ CRUD + fleet + filter
│   │   ├── users.js                ✅ Profile + password + admin
│   │   ├── payments.js             ✅ Stripe + M-Pesa + MTN + Wallet
│   │   ├── documents.js            ✅ PDF waybill + customs + invoice
│   │   ├── notifications.js        ✅ Get, count, mark read, delete, push subscription
│   │   ├── upload.js               ✅ Avatar + truck + cargo + document uploads via Cloudinary
│   │   └── admin.js                ✅ Full admin API
│   ├── services/
│   │   ├── payment.js              ✅ Stripe + M-Pesa + MTN MoMo + Wallet
│   │   ├── email.js                ✅ Nodemailer + 7 HTML email templates
│   │   ├── sms.js                  ✅ Africa's Talking + OTP
│   │   ├── documents.js            ✅ PDFKit — waybill, customs, invoice
│   │   ├── matching.js             ✅ Smart matching + auto-assign + price suggestion
│   │   ├── cloudinary.js           ✅ Upload/delete/signed URLs/thumbnails
│   │   └── notifications.js        ✅ Notification delivery service + 23 templates
│   ├── middleware/
│   │   ├── auth.js                 ✅ JWT protect + role restrict
│   │   └── security.js             ✅ CORS, Helmet, rate limiters, sanitization, error handler
│   ├── tests/
│   │   ├── auth.test.js            ✅ 12 tests — register, login, token
│   │   ├── bookings.test.js        ✅ 14 tests — CRUD, bids, status, rating
│   │   ├── payments.test.js        ✅ 10 tests — wallet, topup, withdraw
│   │   └── notifications.test.js   ✅ 12 tests — service, API, bulk
│   └── scripts/
│       └── seed.js                 ✅ Database seeder (admin + 3 clients + 3 owners + 3 trucks)
├── .github/
│   └── workflows/
│       ├── ci-cd.yml               ✅ lint → test → Docker build → push GHCR → deploy
│       └── pr-checks.yml           ✅ Runs on every PR
├── nginx/
│   └── nginx.conf                  ✅ Production Nginx (SSL, gzip, rate limit, Socket.io proxy)
├── Dockerfile                      ✅ Multi-stage Docker build (node:20-alpine, non-root user)
├── docker-compose.yml              ✅ App + MongoDB + Redis + Nginx + Certbot
├── .env.production                 ✅ All 34 production environment variables
├── .env                            ✅ Development config template
└── package.json                    ✅ All dependencies + scripts
```

---

## 🎨 Design System

### Color Palette (`styles.css` `:root`)
| Token | Value | Usage |
|---|---|---|
| `--primary` | `#F97316` | Orange — main CTAs |
| `--primary-dark` | `#EA580C` | Hover states |
| `--secondary` | `#1E293B` | Dark surfaces |
| `--accent` | `#0EA5E9` | Client/blue elements |
| `--gold` | `#F59E0B` | Stars, highlights |
| `--success` | `#10B981` | Delivered, verified |
| `--danger` | `#EF4444` | Errors, cancellations |
| `--bg-dark` | `#0A0F1E` | Page background |
| `--bg-card` | `#111827` | Card backgrounds |

### Fonts
- **Display/headings:** `Space Grotesk` (Google Fonts)
- **Body:** `Inter` (Google Fonts)

---

## 🖥️ Pages Built

### 1. Homepage (`index.html`)
- Animated hero with floating particles, counter stats
- **Dual signup cards** — Fleet Owner (orange) + Shipper (blue)
- Vehicle fleet showcase (6 types)
- How It Works tabs (Shipper & Owner flows)
- Africa coverage section with SVG map + city dots
- Testimonials grid
- Modal system: Register Owner, Register Client, Login
- Toast notification system

### 2. Client Dashboard (`dashboard-client.html`)
**Sections:** Overview · My Shipments · Payments · Notifications
- Stats: Total Shipments, In Transit, Delivered, Total Spent
- Active shipments list with status badges
- Quick Book form (pre-fills booking wizard)
- Activity feed
- Bookings table with filter tabs + search
- Wallet card + transaction history
- Slide-out shipment detail panel

### 3. Owner Dashboard (`dashboard-owner.html`)
**Sections:** Overview · Job Board · Active Jobs · My Fleet · Earnings · My Bids · Notifications
- Stats: Monthly Earnings, Active Jobs, Completed, Rating
- Job preview list → full job board with cards
- Canvas earnings chart (weekly bar chart)
- Fleet grid with vehicle cards + availability toggle
- Bid modal (select truck, enter amount, message)
- Add Vehicle modal
- Active jobs with progress bars

### 4. Book a Truck (`book-truck.html`)
**5-step wizard:**
1. **Route** — Pickup + destination with African city autocomplete, route meta (distance, duration, cost estimate, cross-border flag)
2. **Vehicle** — 7 vehicle types selection grid + special requirements (GPS, refrigerated, crane, etc.)
3. **Cargo** — Description, weight, flags (fragile/hazardous/perishable/insurance), photo upload
4. **Review** — Summary + Instant Match vs Open for Bids + available trucks grid
5. **Confirm** — Payment method (Wallet/Card/M-Pesa/Cash) + price breakdown + booking confirmation

### 5. Live Tracking (`tracking.html`)
- Left sidebar: shipment list with search + filter tabs
- Full-screen animated map placeholder (Mapbox integration point)
- Live status bar (LIVE indicator, speed, ETA)
- Detail panel: timeline, stats row, progress truck animation, driver card, cargo info
- Driver chat panel (slide-up)
- Confirm delivery + Report issue actions
- **Live simulation:** progress auto-increments every 3s

### 6. Browse Trucks (`listings.html`)
- Search hero bar (From, To, vehicle type, date)
- Left filter panel: vehicle type, price range slider, capacity, rating, features, country, verified-only
- Results grid/list toggle
- Truck cards with owner info, specs, features, price
- Active filter tags
- Skeleton loading state
- Pagination
- Truck detail modal

### 7. Profile (`profile.html`)
**Tabs:** Overview · Personal Info · Documents · Reviews · Security · Preferences
- Profile banner with avatar upload
- Stats grid (shipments, delivered, rating, spent)
- Verification status checklist
- Mini reviews + frequent routes (Overview tab)
- Full editable personal + company forms
- Document upload cards with drag-and-drop modal
- Reviews tab: rating bars + review cards
- Security: password change with strength meter, 2FA toggles, session management
- Preferences: notification channels, language, currency, distance unit, dark mode

### 8. Admin Panel (`admin/admin-dashboard.html`)
**Sections:** Dashboard · Analytics · Users · Trucks · Bookings · Disputes · Payments · Withdrawals · Settings · Audit Logs

**Dashboard Overview:**
- 6 animated KPI cards: Total Users, Active Trucks, Total Bookings, Platform Revenue, KM Covered, Open Disputes — each with sparkline mini-chart
- Revenue + Bookings dual-line canvas chart (switchable 7D / 30D / 12M)
- Vehicle type donut chart with legend
- Top Routes list with progress bars
- Top Countries by bookings (flag + count + %)
- Live admin activity feed
- Recent registrations mini-table
- Pending Actions list (truck verifications, disputes, withdrawals, ID checks)

**Analytics Section:**
- 4 KPI cards (DAU, conversion rate, avg booking value, churn)
- User growth area chart (Clients vs Owners, 7 months)
- Bookings by Country horizontal bar chart
- Rating distribution bar chart

**User Management:**
- Filterable table: All / Shippers / Fleet Owners / Admins tabs
- Search by name/email, filter by status (Active/Suspended/Unverified) and country
- Per-row actions: View detail panel, Edit, Suspend/Activate, Delete
- Checkbox bulk select
- Add User modal (manual account creation)
- User count display

**Truck Management:**
- Filterable table: All / Verified / Pending Review / Suspended tabs
- Search by plate/make/owner, filter by vehicle type
- Per-row: View, Approve (for pending), Suspend
- Verification status badges
- Truck detail side panel

**Booking Management:**
- Status tabs: All / Pending / In Transit / Delivered / Disputed / Cancelled
- Full table with client, route, vehicle, date, amount, status
- Export CSV button
- Resolve shortcut for disputed bookings

**Disputes:**
- Cards showing both parties' claims side by side
- Urgency badge (High / Medium)
- Resolve modal: resolution type, refund amount, admin notes, notify parties checkboxes

**Payments:**
- 4 KPI cards: Total Volume, Platform Fees, Pending, Refunded
- Full transactions table: ID, user, type, amount, method, booking ref, date, status

**Withdrawals:**
- Pending withdrawal cards with owner name, method (M-Pesa/Bank), amount, date
- Approve / Reject per card

**Settings:**
- 4 setting groups: Finance (commission %, min booking, withdrawal limits), Operations (bid duration, booking expiry, auto-assign), Security (session duration, login attempts, 2FA), Notifications (SMS, email digest, push)
- Inline editable values

**Audit Logs:**
- Full action log table: timestamp, admin, action type (CREATE/UPDATE/DELETE/SUSPEND/APPROVE/RESOLVE), target, IP address, status
- Export Logs button
- Color-coded action badges

**Notification Composer:**
- Target audience selector (All Users / Clients / Owners / Specific Country)
- Title, message, channel (push/email/SMS) fields
- Live preview card

---

## 🔌 Real-Time Layer — Socket.io

### Files
| File | Description |
|---|---|
| `backend/socket/index.js` | Server-side Socket.io handler |
| `frontend/js/socket-client.js` | Client-side `iTruckSocket` class (singleton) |
| `backend/server.js` (updated) | Replaced `app.listen` with `http.createServer` + `socket.io` |

### Server (`backend/socket/index.js`)
- JWT auth middleware on every socket connection (`socket.handshake.auth.token`)
- In-memory stores: `activeUsers` (userId→socketId), `activeTrucks` (bookingId→coords), `activeRooms` (bookingId→Set of socketIds)
- **Events handled:** `join-booking`, `leave-booking`, `update-location`, `get-location`, `send-message`, `typing`, `new-bid`, `bid-accepted`, `status-update`, `driver-online`, `admin-broadcast`, `disconnect`
- **Events emitted:** `connected`, `joined-booking`, `location-update`, `new-message`, `message-notification`, `bid-received`, `bid-confirmed`, `bid-update`, `booking-confirmed`, `booking-status-changed`, `push-notification`, `platform-notification`, `user-typing`, `driver-status`
- Helper methods exported: `io.emitToUser(userId, event, data)`, `io.emitToBooking(bookingId, event, data)`

### Client (`frontend/js/socket-client.js`)
**Class:** `iTruckSocket` — singleton at `window.iTruckSocket`, auto-connects if token in localStorage

**Emit methods:**
- `connect(token)` — connects with JWT, sets up all server event listeners
- `joinBooking(bookingId)` / `leaveBooking(bookingId)`
- `sendLocation(bookingId, coords)` — lat, lng, speed, heading
- `sendMessage(bookingId, message, recipientId)` — with offline message cache
- `sendTyping(bookingId, isTyping)`
- `notifyNewBid(bookingId, clientId, bidData)`
- `notifyBidAccepted(bookingId, ownerId)`
- `updateStatus(bookingId, status, location, notes)`
- `setDriverOnline(location)`
- `adminBroadcast(title, message, type)`

**System event handler (`_handleSystemEvent`):**
- `push-notification` → browser notification + in-app toast
- `platform-notification` → in-app toast
- `bid-received` → toast + badge update
- `booking-status-changed` → DOM badge update

**GPS tracking:**
- `startGPSTracking(bookingId)` — `navigator.geolocation.watchPosition` → `sendLocation`
- `stopGPSTracking(watchId)` — `clearWatch`

**Event bus:** `on(event, cb)` / `off(event, cb)` — pub/sub layer over socket events

---

## 💳 Payment Services

### Files
| File | Description |
|---|---|
| `backend/services/payment.js` | 4 payment service classes |
| `backend/models/Transaction.js` | Transaction log schema |
| `backend/routes/payments.js` | All payment API endpoints |

### Service Classes (`backend/services/payment.js`)

**StripeService:**
- `createPaymentIntent(amount, currency, metadata)` → `{ clientSecret, intentId }`
- `confirmPayment(paymentIntentId)` → `{ success, status, amount, currency }`
- `createRefund(paymentIntentId, amount)` → `{ success, refundId }`
- `createConnectedAccount(email, country)` → Stripe Express account for owners
- `transferToOwner(amount, ownerStripeId, currency)` → payout to owner
- `constructWebhookEvent(payload, signature)` → webhook verification

**MpesaService (Safaricom Daraja):**
- `getAccessToken()` → OAuth2 bearer token
- `generatePassword()` → base64 encoded timestamp+passkey
- `stkPush(phone, amount, bookingId)` → Lipa na M-Pesa STK push prompt
- `querySTK(checkoutRequestId)` → check STK push status
- `b2cPayment(phone, amount, remarks)` → pay to mobile (withdrawals)
- Supports sandbox and production environments via `MPESA_ENV`

**MTNMoMoService:**
- `getToken()` → collection API bearer token
- `requestToPay(phone, amount, currency, bookingId)` → MoMo payment request
- `getTransactionStatus(referenceId)` → poll payment status
- Supports sandbox and production via `MTN_ENV`

**WalletService:**
- `getBalance(userId)` → wallet balance from User model
- `credit(userId, amount, description, reference)` → `$inc walletBalance`
- `debit(userId, amount, description, reference)` → checks balance, throws if insufficient
- `_logTransaction(...)` → creates Transaction document

### Transaction Model (`backend/models/Transaction.js`)
```
user (→User), booking (→Booking),
type (credit/debit/refund/fee/withdrawal),
amount, currency,
description, reference,
method (wallet/stripe/mpesa/mtn/cash/bank),
status (pending/completed/failed/reversed),
metadata (Mixed)
```
Indexes: `{ user, createdAt }`, `{ booking }`, `{ status }`

### Payment Routes (`/api/payments`)
| Method | Route | Description |
|---|---|---|
| POST | `/stripe/intent` | Create Stripe payment intent |
| POST | `/stripe/confirm` | Confirm payment + log transaction + platform fee |
| POST | `/mpesa/stk-push` | Trigger M-Pesa STK push |
| POST | `/mpesa/callback` | M-Pesa webhook (public) |
| POST | `/mpesa/query` | Query STK push status |
| POST | `/mtn/request` | MTN MoMo payment request |
| GET | `/mtn/status/:refId` | Poll MTN transaction status |
| GET | `/wallet/balance` | Get wallet balance |
| POST | `/wallet/topup` | Credit wallet |
| POST | `/wallet/pay` | Pay booking from wallet |
| POST | `/wallet/withdraw` | Request withdrawal (owner only), deducts $2 fee |
| GET | `/transactions` | Paginated transaction history |
| POST | `/webhook/stripe` | Stripe webhook handler (raw body) |

---

## ✉️ Email & SMS Services

### Email (`backend/services/email.js`)
Nodemailer with full dark-themed HTML email template system.

**Base template:** Responsive dark HTML email (inline CSS), iTruck branding, orange accents, social links, unsubscribe footer.

**7 email templates:**
| Template | Trigger | Subject |
|---|---|---|
| `welcome` | On registration | Welcome, {name}! 🚛 |
| `bookingConfirmed` | Booking confirmed | Booking Confirmed — {id} 📦 |
| `bookingDelivered` | Delivery confirmed | Delivered Successfully — {id} 🎉 |
| `newBid` | Bid placed | New Bid on Your Shipment |
| `passwordReset` | Password reset request | Reset Your iTruck Password 🔐 |
| `withdrawalProcessed` | Withdrawal approved | Withdrawal Processed — ${amount} 💰 |
| `verificationOTP` | OTP request | Your iTruck Verification Code: {otp} |

**Usage:** `sendEmail(to, templateName, dataArray)`

### SMS (`backend/services/sms.js`)
Africa's Talking SDK with phone number normalisation and OTP system.

**10 SMS templates:** `bookingConfirmed`, `otpVerification`, `driverAssigned`, `cargoPickedUp`, `cargoDelivered`, `newBid`, `paymentReceived`, `withdrawalApproved`, `crossBorderAlert`, `customMessage`

**Key functions:**
- `sendSMS(to, templateName, data)` — normalises phone (0xxx → +254xxx), sends via AT
- `sendBulkSMS(recipients, message)` — chunks to 100 per batch
- `generateOTP(length)` — numeric OTP
- `sendOTP(phone, userId)` — generates, saves to user with 10min expiry, sends SMS
- `verifyOTP(userId, inputOTP)` — checks expiry, marks user verified, clears OTP

---

## 🗺️ Mapbox Full Integration

### File: `frontend/js/maps.js`
**Class:** `iTruckMaps` — instantiated per map container, full Mapbox GL JS wrapper.

**Init:** Dark globe style (`dark-v11`), Africa-centered (lng:25, lat:0, zoom:3.5), fog/atmosphere effect, Navigation + Fullscreen + Geolocate controls.

**Marker methods:**
- `addMarker(id, lngLat, options)` — custom HTML element marker with icon, label, popup, hover scale
- `updateMarker(id, lngLat)` — move existing marker
- `removeMarker(id)` — remove from map
- `addTruckMarker(bookingId, lngLat, label)` — animated pulsing truck icon marker
- `moveTruckMarker(bookingId, lngLat, duration)` — smooth cubic-ease animation between coordinates

**Route methods:**
- `drawRoute(id, origin, destination, waypoints)` — calls Mapbox Directions API, draws 3-layer route (shadow + main orange line + animated dashes)
- `removeRoute(id)` — cleans up all route layers and sources
- Fits map bounds to route with padding after drawing

**Geocoding:**
- `geocode(query)` → `[{ name, lngLat, country }]` — Mapbox Places API, Africa-scoped
- `reverseGeocode(lngLat)` → place name string

**Heatmap:**
- `addTruckHeatmap(trucks)` — orange heatmap layer of all active truck positions across Africa

**Controls:** `flyTo(lngLat, zoom, duration)`, `fitBounds(bounds, options)`, `setStyle(style)`

**Fallback:** If Mapbox not loaded, renders a styled placeholder with instructions.

**Event bus:** `on(event, cb)` / `_emit(event, data)` — emits `ready`, `click`

---

## 📱 PWA — Progressive Web App

### Files
| File | Description |
|---|---|
| `frontend/manifest.json` | Web app manifest |
| `frontend/sw.js` | Service Worker |
| `frontend/js/pwa.js` | Install/update/offline logic |

### Manifest (`manifest.json`)
- 8 icon sizes (72→512px), maskable icons for Android
- 3 app shortcuts: Book a Truck, Track Shipment, My Dashboard
- Display: `standalone`, theme: `#F97316`, background: `#0A0F1E`
- Screenshots for wide display (home + dashboard)

### Service Worker (`sw.js`)
**Cache strategy:**
- Static assets → cache-first (HTML, CSS, JS, fonts, Font Awesome)
- API requests (`/api/*`) → network-first with cache fallback
- Socket.io requests → skipped (pass-through)
- Offline fallback → `/index.html` for pages, JSON 503 for API

**3 cache buckets:** `itruck-v1.0.0` (static), `itruck-dynamic-v1` (pages), `itruck-api-v1` (API responses)

**Push notifications:** Full `push` event handler — vibration pattern, action buttons (View/Dismiss), `requireInteraction` for urgent

**Notification click:** Opens or focuses existing window at notification URL

**Background sync:** `sync-bookings` (retry pending requests from IndexedDB), `sync-location` (stub)

**Periodic sync:** `check-updates` stub

### PWA JS (`pwa.js`)
- Service worker registration with update detection banner
- Push subscription via `PushManager` → sends subscription to `/api/users/push-subscription`
- `installApp()` — triggers deferred `beforeinstallprompt`
- Install banner — slides up from bottom with truck emoji, Install button
- Update banner — top-right with "Refresh to update" prompt
- Online/Offline indicators — red banner when offline

---

## 📄 Cross-Border Document Generation

### Files
| File | Description |
|---|---|
| `backend/services/documents.js` | PDFKit document generator |
| `backend/routes/documents.js` | PDF download endpoints |

### Document Types (`backend/services/documents.js`)
Uses `pdfkit` — generates PDF buffers returned directly to client.

**Waybill / Consignment Note (`generateWaybill`):**
- Orange branded header + iTruck logo
- Sections: Shipper, Carrier/Truck Owner, Shipment Route, Cargo Description, Terms & Conditions, Signatures (3 fields)
- Populated from booking, owner, client, truck documents

**Customs Declaration (`generateCustomsDeclaration`):**
- Exporter, Consignee, Description of Goods, HS Code, Country of Origin/Destination
- Gross Weight, Declared Value, Incoterms (DAP)
- Signature + declaration text

**Commercial Invoice (`generateInvoice`):**
- Invoice number (INV-{timestamp}), bill-to block
- Line items table: Freight Charge + Platform Fee (5%)
- Subtotal, fee, total in orange
- Payment method + booking ID footer

### Document Routes (`/api/documents`)
| Method | Route | Returns |
|---|---|---|
| GET | `/waybill/:bookingId` | PDF inline (waybill) |
| GET | `/customs/:bookingId` | PDF inline (customs declaration) |
| GET | `/invoice/:bookingId` | PDF inline (commercial invoice) |

All routes: protected, populate booking with client/owner/truck, set `Content-Type: application/pdf`.

---

## 🧠 Smart Matching Engine

### File: `backend/services/matching.js`
Singleton class for intelligent truck-to-booking matching.

**`findBestMatches(bookingRequest, availableTrucks)`**
Scores each truck and returns top 10 sorted by score:
| Criteria | Points |
|---|---|
| Vehicle type exact match | 40 |
| No type preference | 20 |
| Capacity match (>50% utilisation) | 25 |
| Capacity match (<50% utilisation) | 15 |
| Over capacity | Disqualified (0) |
| Rating 4.8+ | 20 |
| Rating 4.5+ | 16 |
| Rating 4.0+ | 12 |
| Rating 3.5+ | 8 |
| New truck (no rating) | 2 |
| Verified badge | +10 |
| Special requirement matched | +5 each |
| Special requirement missing | -3 each |

**`autoAssign(bookingId)`** — finds best verified available truck, updates booking to `confirmed`.

**`suggestPrice(distance, vehicleType, cargo)`** — returns `{ min, max, suggested, perKm }` based on base rates per vehicle type, cargo modifiers (fragile +15%, hazardous +25%, perishable +20%, insurance +$25), distance tier discounts (>1000km -8%, >2000km -12%).

**`optimizeRoute(bookings)`** — nearest-neighbor algorithm for multi-stop route planning.

**`forecastDemand(historicalData)`** — compares recent 7-day avg vs overall avg, returns `{ predicted, trend, avg, recentAvg }`.

**`_haversine(a, b)`** — great-circle distance between two lat/lng points.

---

## 🔒 Security & Production Hardening

### File: `backend/middleware/security.js`

**CORS (`corsOptions`):** Whitelist from `ALLOWED_ORIGINS` env var, credentials, OPTIONS preflight, 600s max-age.

**Helmet CSP (`helmetConfig`):** Allows Mapbox, Stripe, Google Fonts, Font Awesome, blob/data URIs for images, WebSocket connections.

**Rate limiters:**
| Limiter | Window | Max Requests | Applied To |
|---|---|---|---|
| `globalLimiter` | 15 min | 200 | All `/api` routes |
| `authLimiter` | 15 min | 10 (skip success) | `/api/auth` |
| `paymentLimiter` | 60 min | 30 | `/api/payments` |
| `uploadLimiter` | 60 min | 20 | File upload routes |

**Sanitization stack:** `express-mongo-sanitize` (replaces `$` with `_`), `xss-clean` (strips XSS), `hpp` (prevents HTTP parameter pollution, whitelist: sort, fields, page, limit, vehicleType, status, country)

**Upload middleware (`uploadMiddleware`):** Multer with `memoryStorage`, 10MB limit, allowed types: JPEG, PNG, WebP, PDF.

**Error handler (`errorHandler`):** Catches Mongoose ValidationError, CastError, duplicate key (11000), JWT errors — returns standardised `{ success, message }` JSON with stack trace in development.

---

### Stack
- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** MongoDB + Mongoose
- **Auth:** JWT (7-day expiry)
- **Security:** Helmet, CORS, rate limiting (express-rate-limit)
- **Validation:** express-validator

### Auth Endpoints (`/api/auth`)
| Method | Route | Access | Description |
|---|---|---|---|
| POST | `/register/owner` | Public | Register fleet owner |
| POST | `/register/client` | Public | Register shipper |
| POST | `/login` | Public | Login (role-specific) |
| GET | `/verify` | Bearer | Verify JWT token |

### Bookings (`/api/bookings`)
| Method | Route | Access | Description |
|---|---|---|---|
| GET | `/` | Protected | Get user's bookings |
| GET | `/:id` | Protected | Get single booking |
| POST | `/` | Client only | Create booking |
| PATCH | `/:id/status` | Protected | Update status + tracking |
| POST | `/:id/bids` | Owner only | Place bid |
| PATCH | `/:id/bids/:bidId/accept` | Client only | Accept bid |
| PATCH | `/:id/rate` | Protected | Rate completed booking |

### Trucks (`/api/trucks`)
| Method | Route | Access | Description |
|---|---|---|---|
| GET | `/` | Public | List trucks (with filters) |
| GET | `/:id` | Public | Single truck detail |
| POST | `/` | Owner only | Add vehicle |
| PATCH | `/:id` | Owner only | Update vehicle |
| DELETE | `/:id` | Owner/Admin | Remove vehicle |
| GET | `/owner/fleet` | Owner only | My fleet |

### Users (`/api/users`)
| Method | Route | Access | Description |
|---|---|---|---|
| GET | `/me` | Protected | My profile |
| PATCH | `/me` | Protected | Update profile |
| PATCH | `/me/password` | Protected | Change password |
| GET | `/:id` | Public | View user profile |
| GET | `/` | Admin only | List all users |
| PATCH | `/:id/toggle-active` | Admin only | Suspend/activate |

---

## 🗄️ Database Models

### User
```
firstName, lastName, email (unique), phone, countryCode,
password (bcrypt, hidden), role (client/owner/admin),
country, accountType (personal/business/ngo), company,
isVerified, isActive, avatar, rating, totalTrips,
createdAt, lastLogin
```

### Truck
```
owner (→User), vehicleType, make, model, year, plateNumber (unique),
capacity, capacityUnit, photos[], features[],
baseLocation { country, city, coordinates },
preferredRoutes[], pricePerKm, pricePerDay, currency,
isAvailable, isVerified, rating, totalJobs,
insurance { provider, policyNum, expiresAt },
documents { logbook, insurance, roadWorthiness }
```

### Booking
```
client (→User), truck (→Truck), owner (→User),
vehicleTypeRequested, cargo { description, weight, isFragile, isHazardous, photos[] },
pickup { address, city, country, coordinates, scheduledAt, notes },
destination { address, city, country, coordinates, notes },
distance, isCrossBorder,
status (pending/bidding/confirmed/in-transit/delivered/cancelled/disputed),
bids[] { owner, truck, amount, currency, message, estimatedDays },
agreedPrice, currency,
payment { status, method, reference, paidAt },
tracking[] { status, location, timestamp, notes },
clientRating, ownerRating, clientReview, ownerReview
```

---

---

## 🛡️ Admin Panel — Technical Details

### Files
| File | Description |
|---|---|
| `pages/admin/admin-dashboard.html` | Full admin UI — 10 sections, all modals |
| `css/admin.css` | Admin-specific styles (sidebar, KPI cards, tables, dispute cards, etc.) |
| `js/admin.js` | All admin logic — charts, tables, filters, modals |

### Admin Mock Data (in `admin.js`)
- **8 users** across KE, GH, NG, ZA, EG — mix of clients and owners
- **5 trucks** with verified/unverified status across multiple countries
- **6 bookings** covering all statuses (in-transit, delivered, disputed, cancelled)
- **2 open disputes** with full party claims and descriptions
- **4 withdrawal requests** (M-Pesa and Bank methods)
- **4 reviews** including 1 flagged review
- **6 audit log entries** with action types
- **6 payments** (booking, withdrawal, topup, refund types)
- **Top 6 routes** with booking counts
- **Top 6 countries** with flags, booking counts, percentages
- **4 platform setting categories** (Finance, Operations, Security, Notifications)
- **4 analytics KPIs** (avg booking value, delivery success rate, avg rating, avg trip duration)

### Canvas Charts (5 total + 6 sparklines)
| Chart | ID | Type | Data |
|---|---|---|---|
| Revenue & Bookings | `revenueChart` | Dual-line area + dashed | 7-day revenue ($) + booking count, with legend |
| Vehicle Type Breakdown | `vehicleTypeChart` | Donut | 6 vehicle types, center total count |
| User Growth | `userGrowthChart` | Dual area + line | Shippers vs Fleet Owners, 7 months |
| Bookings by Country | `countryBookingsChart` | Horizontal bar | Top 6 countries with gradient bars |
| Rating Distribution | `ratingDistChart` | Vertical bar | 1–5 star spread |
| KPI Sparklines | `spark*` | Mini line (×6) | One per KPI card, dynamically created |

### Admin Functions — Complete Reference

**Render functions (called on DOMContentLoaded):**
- `initDateDisplay()` — shows live date in topbar
- `initKPICounters()` — animated number counters for all 6 KPI cards
- `initCharts()` — draws all 5 canvas charts + 6 sparklines
- `renderTopRoutes()` — routes with percentage progress bars
- `renderTopCountries()` — flag + name + count + percentage
- `renderAdminActivity()` — live feed with colored dots
- `renderRecentUsers()` — 5-row mini table on overview
- `renderPendingActions()` — action cards with section navigation
- `renderUsersTable()` — full filterable users table
- `renderTrucksTable()` — full filterable trucks table
- `renderBookingsTable()` — full filterable bookings table
- `renderDisputes()` — dispute cards with party claims
- `renderWithdrawals()` — withdrawal cards with approve/reject
- `renderPaymentsTable()` — payments KPI row + transactions table
- `renderReviewsAdmin()` — review cards with flagged highlighting
- `renderSettings()` — dynamically built settings grid from data
- `renderAuditLogs()` — action log table with color-coded badges
- `renderAnalyticsKPIs()` — 4 analytics stat cards
- `renderNotificationComposer()` — full composer + live preview panel

**Filter functions:**
- `filterUsersTable()` — applies role, status, country, search
- `filterTrucksTable()` — applies status, type, search
- `filterBookingsTable()` — applies status, search
- `applyUserFilters()` — returns filtered user array (used by render)

**Action functions:**
- `toggleUserStatus(id)` — suspend/activate with confirm modal
- `confirmDeleteUser(id)` — delete with confirm, splices from array
- `sendUserMessage(id)` — toast confirmation
- `approveTruck(id)` — sets verified=true, re-renders, logs action
- `confirmSuspendTruck(id)` — suspend with confirm
- `approveWithdrawal(id)` — confirm → splice → toast
- `rejectWithdrawal(id)` — confirm → splice → toast
- `deleteReview(id)` — confirm → splice → re-render
- `sendAdminNotification()` — validates fields → toast
- `scheduleNotification()` — stub toast
- `saveSetting(key, value)` — logs update action
- `saveSettingCategory(category)` — logs + toasts
- `exportReport()` / `exportAnalytics()` / `exportBookings()` / `exportLogs()` — toast stubs

**Panel/modal functions:**
- `openUserPanel(id)` / `closeUserPanel()` — slide-out with user detail + actions
- `openTruckPanel(id)` / `closeTruckPanel()` — slide-out with truck detail + approve/suspend
- `openDisputeModal(id)` / `closeDisputeModal()` — resolve form modal
- `handleResolveDispute(e)` — async submit with loading state
- `openAddUserModal()` / `closeAddUserModal()` — manual user creation
- `handleAddUser(e)` — async submit with loading state
- `showConfirm(title, msg, onOk)` / `closeConfirm()` — reusable confirm dialog

**Navigation & utility:**
- `showAdminSection(name)` — switches active section, updates breadcrumb, redraws charts if overview
- `initFilterTabs()` — attaches click events to all role/status tab groups
- `initPeriodTabs()` — attaches period switcher to revenue chart
- `selectAllRows(type)` — bulk checkbox select
- `logAction(action, target)` — prepends to audit log array + re-renders
- `updateNotifPreview()` — live preview card updates on input
- `showToast(msg, type)` — success/error/info toast
- `delay(ms)` — promise wrapper for async loading simulation

### Admin Modals
| Modal | Trigger | Purpose |
|---|---|---|
| User Detail Panel | `openUserPanel(id)` | View user info, suspend/activate, send email, delete |
| Truck Detail Panel | `openTruckPanel(id)` | View truck info, approve verification, suspend |
| Resolve Dispute | `openDisputeModal(id)` | Resolution type, refund amount, admin notes, notify toggles |
| Add User | `openAddUserModal()` | Create account manually with temp password |
| Confirm Action | `showConfirm(...)` | Reusable confirm/cancel used by all destructive actions |

---

## 🚀 Quick Start

```bash
# 1. Clone / setup
mkdir itruck && cd itruck

# 2. Backend setup
cd backend
npm install

# 3. Configure environment
cp .env.example .env
# Edit: MONGODB_URI, JWT_SECRET, PORT

# 4. Run development server
npm run dev
# Server: http://localhost:5000
# Frontend served from: http://localhost:5000/index.html
```

### .env Template
```env
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:5000
MONGODB_URI=mongodb://localhost:27017/itruck
JWT_SECRET=itruck_super_secret_change_in_production
JWT_EXPIRES=7d
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@itruck.africa
SMTP_PASS=your_app_password
```

---

## 📦 Dependencies

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "mongoose": "^8.0.0",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.2",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "express-validator": "^7.0.1",
    "express-rate-limit": "^7.1.0",
    "helmet": "^7.1.0",
    "nodemailer": "^6.9.7",
    "morgan": "^1.10.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.2"
  }
}
```

---

## 🔌 Third-Party Integrations — All Completed ✅

| Service | File | Status |
|---|---|---|
| Mapbox GL JS | `frontend/js/maps.js` | ✅ Full iTruckMaps class |
| Stripe | `backend/services/payment.js` | ✅ Intent, confirm, refund, connected accounts |
| M-Pesa Daraja | `backend/services/payment.js` | ✅ STK push, B2C, query |
| MTN MoMo | `backend/services/payment.js` | ✅ Request to pay, status |
| Africa's Talking | `backend/services/sms.js` | ✅ SMS + OTP |
| Cloudinary | `backend/services/cloudinary.js` | ✅ Upload, delete, thumbnails, signed URLs |
| Socket.io | `backend/socket/index.js` | ✅ Redis-backed, GPS, chat, bids |
| Web Push API | `frontend/sw.js` + `frontend/js/pwa.js` | ✅ Push notifications, VAPID |
| PDFKit | `backend/services/documents.js` | ✅ Waybill, customs, invoice |

---

## 🔗 Frontend API Client (`js/api.js`)

**Class:** `iTruckAPI` — singleton at `window.API`, auto-reads token from localStorage.

### Core fetch layer
- `_fetch(endpoint, options)` — attaches `Authorization: Bearer` header, handles 401 (calls `_handleUnauthorized()`), parses JSON, throws on non-2xx, catches network errors
- `_get / _post / _patch / _put / _delete` — convenience wrappers
- `_postForm(endpoint, formData)` — multipart upload without Content-Type header
- Interceptor support: `addInterceptor(fn)` — runs before every request

### Namespaced method groups

**`auth`:** `registerClient`, `registerOwner`, `login`, `verify`, `refreshToken`, `loginAndStore` (stores token + user to localStorage), `logout` (clears storage + redirects)

**`users`:** `me`, `update`, `changePassword`, `getById`, `savePushSubscription`

**`trucks`:** `getAll(params)`, `getById`, `create`, `update`, `delete`, `myFleet`

**`bookings`:** `getAll`, `getById`, `create`, `updateStatus`, `placeBid`, `acceptBid`, `rate`

**`payments`:** `stripeIntent`, `stripeConfirm`, `mpesaSTK`, `mpesaQuery`, `mtnRequest`, `mtnStatus`, `walletBalance`, `walletTopup`, `walletPay`, `walletWithdraw`, `transactions`

**`notifications`:** `getAll`, `count`, `markRead`, `markAllRead`, `delete`, `clearRead`, `savePushSub`

**`uploads`:** `avatar(file)`, `truckPhotos(truckId, files)`, `cargoPhotos(files)`, `document(file, type)`

**`documents`:** `waybill`, `customs`, `invoice` — return blob URLs for PDF download

**`admin`:** Full suite covering stats, analytics, users, trucks, bookings, disputes, payments, withdrawals, notify, settings, suggestPrice, autoAssign

---

## 🔐 Auth Guard (`js/auth-guard.js`)

IIFE — runs immediately on every dashboard page, before DOM ready.

**Protected paths:** all dashboard, booking, tracking, listings, profile, and admin pages.

**Logic flow:**
- No token/user → saves `redirect_after_login` to sessionStorage → redirects to `/?auth=required`
- `/admin/` + role !== `admin` → redirects to homepage
- `dashboard-owner` + role !== `owner` → redirects to client dashboard
- `dashboard-client` + role === `owner` → redirects to owner dashboard

**Auto-populates UI on DOMContentLoaded:** sets `#sidebarName`, `#sidebarAvatar`, `#topbarAvatar`, `#welcomeName`, adds `itruck-role-{role}` to `document.body`

---

## 🔔 Notifications UI (`js/notifications-ui.js`)

**Class:** `NotificationsUI` — self-initialising, injects its own DOM and CSS into `document.body`.

**Panel:** 420px slide-in from right, full viewport height, dark themed.

**Features:** Unread badge on bell, paginated list (20 per page + Load More), mark read on click, delete per item, mark all read, type-based colour icons, relative timestamps, empty state, skeleton loader.

**Socket integration:** Listens to `new-notification` → prepends item, increments badge.

**API integration:** All actions call `window.API.notifications.*`.

Auto-initialises: `window.notificationsUI = new NotificationsUI()`

---

## ⭐ Rating System (`js/rating.js`)

**Auto-open triggers:** Socket event `open-rating-modal` (fires after delivery) + URL param `?rate={bookingId}` (email deep-link).

**Star component:** Hover preview, fill animation, label text (Poor → Excellent! 🎉).

**`submitRating(e)`** — validates selection, calls `window.API.bookings.rate()`, shows toast, closes modal.

---

## 📢 Notification Model (`backend/models/Notification.js`)

**23 notification types:** booking confirmed/cancelled/delivered, bid received/accepted/rejected, payment received/failed, withdrawal approved/rejected, truck verified/rejected, account verified/suspended, new message, dispute opened/resolved, system, promo, driver assigned, cargo picked up/delivered, cross border alert, review received.

**Schema:** `recipient` (indexed), `sender`, `type`, `title` (max 120), `message` (max 500), `data { bookingId, truckId, userId, amount, route, actionUrl, imageUrl }`, `channels { inApp, email, sms, push }`, `read` (indexed), `readAt`, `delivered`, `priority` (low/normal/high/urgent), `expiresAt` (TTL auto-delete index).

**Static methods:** `deliver(payload)`, `unreadCount(userId)`, `markAllRead(userId)`

**Instance method:** `markRead()` — sets read=true, readAt=now

---

## 📢 Notification Routes + Service

### Routes (`/api/notifications`)
| Method | Route | Description |
|---|---|---|
| GET | `/` | Paginated notifications |
| GET | `/count` | Unread count |
| PATCH | `/:id/read` | Mark read + emit socket count |
| PATCH | `/read-all` | Mark all read + emit count: 0 |
| DELETE | `/:id` | Delete single |
| DELETE | `/clear/read` | Bulk delete read |
| POST | `/push-subscription` | Save Web Push sub to User |

### Service (`backend/services/notifications.js`)
- **23 message templates** — each returns `{ title, message, priority }` from data
- `deliver(userId, type, data, options)` — creates doc, emits socket `new-notification`, sends email/SMS per channel flags
- `getAll(userId, page, limit)` — paginated with total count
- `notifyBookingParties(booking, type, data)` — delivers to both client and owner simultaneously

---

## ☁️ Cloudinary Service (`backend/services/cloudinary.js`)

**5 folders:** `itruck/avatars`, `itruck/trucks`, `itruck/cargo`, `itruck/documents`, `itruck/verification`

**5 transformation presets:** avatar (400×400 face-crop), truck (800×600), cargo (1000×750 limit), document (auto), thumbnail (200×200 low)

**Functions:** `uploadBuffer(buffer, options)`, `uploadFromUrl(url, options)`, `deleteFile(publicId)`, `generateSignedUploadUrl(type, userId)`, `getThumbnail(publicId)`

---

## 📤 Upload Routes (`/api/upload`)

All protected, Multer memoryStorage, 10MB, JPEG/PNG/WebP/PDF only.

| Route | Files | Description |
|---|---|---|
| POST `/avatar` | 1 | Deletes old, uploads new, updates User.avatar |
| POST `/truck/:truckId` | up to 8 | Verifies ownership, pushes URLs to Truck.photos |
| POST `/cargo` | up to 5 | Returns URLs for booking cargo photos |
| POST `/document` | 1 | Saves to User.documents by type |
| DELETE `/photo` | — | Deletes from Cloudinary + doc array |

---

## 🧪 Test Suites (`backend/tests/`)

**Stack:** Jest + Supertest, separate test DB (`itruck_test`), dropped after each suite.

| Suite | Tests | Coverage |
|---|---|---|
| `auth.test.js` | 12 | Register client/owner, login, token verify, duplicate email, wrong password, inactive account |
| `bookings.test.js` | 14 | Create, list, bid, accept bid, status update, rating, role restrictions |
| `payments.test.js` | 10 | Wallet balance, topup, pay, withdraw, minimum check, insufficient funds |
| `notifications.test.js` | 12 | List, count, mark read, mark all, delete, clear, push sub, cross-user access |
| **Total** | **48** | |

---

## 🔄 CI/CD Pipeline (`.github/workflows/`)

### `ci-cd.yml` — 4 jobs (push to main/develop, PR to main)

| Job | Needs | Steps |
|---|---|---|
| **lint** | — | Checkout → Node 20 → npm ci → ESLint (warn-only) |
| **test** | lint | Spins up MongoDB 7 + Redis 7 services → npm test --coverage → Codecov upload → artifact archive |
| **build** | test (main only) | Docker login GHCR → build image (sha + branch + latest tags) → push |
| **deploy** | build (main only) | SSH to VPS → docker pull → docker-compose up --no-deps → health check poll |

### `pr-checks.yml`
Runs lint + test on every PR, posts coverage comment.

---

## 📊 Complete Project Stats

| Category | Count |
|---|---|
| HTML pages | 9 (including admin) |
| CSS files | 7 |
| Frontend JS files | 15 |
| Backend route files | 9 |
| Backend service files | 7 |
| Database models | 5 |
| Test suites | 4 (48 tests total) |
| Email templates | 7 |
| SMS templates | 10 |
| Notification types | 23 |
| Socket events (server→client) | 14 |
| Socket events (client→server) | 11 |
| API endpoints | 65+ |
| Docker services | 5 |
| CI/CD jobs | 4 |
| npm dependencies | 20 production + 3 dev |
| Environment variables | 34 |

---

## 🛠️ Complete Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3 (custom design system), Vanilla JS ES6+ |
| Backend | Node.js 20, Express 4 |
| Database | MongoDB 7 + Mongoose 8 |
| Cache/State | Redis 7 (sessions, socket state, message history) |
| Real-time | Socket.io 4 + @socket.io/redis-adapter |
| Payments | Stripe + Safaricom M-Pesa Daraja + MTN MoMo |
| File Storage | Cloudinary (images + documents) |
| Email | Nodemailer + Gmail SMTP |
| SMS | Africa's Talking API |
| Maps | Mapbox GL JS |
| Documents | PDFKit (waybill, customs declaration, invoice) |
| Auth | JWT + bcryptjs + OTP (6-digit, 10min expiry) |
| Security | Helmet CSP, CORS, 4× rate limiters, XSS clean, HPP, mongo-sanitize |
| PWA | Service Worker, Web Push API, Background Sync, IndexedDB |
| Containerisation | Docker + Docker Compose + Nginx Alpine + Let's Encrypt SSL |
| CI/CD | GitHub Actions (lint → test → build → deploy) |
| Testing | Jest + Supertest (48 tests) |

---

## 🖥️ Production `server.js` — Final Version

The final `server.js` brings together everything:
- Imports all security middleware from `middleware/security.js`
- Creates `http.Server` wrapping Express, attaches Socket.io
- Mounts all 7 route groups: `auth`, `users`, `trucks`, `bookings`, `payments`, `documents`, `admin`
- Static file serving with 7-day cache in production
- SPA catch-all sending `index.html`
- Centralised error handler at end of middleware chain
- MongoDB connection with `serverSelectionTimeoutMS` + `socketTimeoutMS`
- **Graceful shutdown** on `SIGTERM`/`SIGINT` — closes HTTP server, disconnects MongoDB, exits cleanly within 10s
- Global handlers for `uncaughtException` and `unhandledRejection`
- Exports `{ app, server, io }` for testing

---

## 🛡️ Admin API Routes (`/api/admin`)

All routes protected by `[protect, restrictTo('admin')]`.

### Stats & Analytics
| Method | Route | Description |
|---|---|---|
| GET | `/stats` | 9 KPIs: totalUsers, totalTrucks, totalBookings, activeBookings, openDisputes, totalRevenue, monthlyUsers, monthlyBookings, monthlyRevenue — uses `Promise.all` for parallel queries |
| GET | `/analytics?days=30` | 5 MongoDB aggregations: userGrowth by day, bookingsByStatus, revenueByDay, topRoutes (top 10), vehicleTypeDist |

### User Management
| Method | Route | Description |
|---|---|---|
| GET | `/users` | Paginated, filterable by role/status/country/search/sort |
| PATCH | `/users/:id/toggle-active` | Suspend or activate user |
| PATCH | `/users/:id/verify` | Mark verified + send welcome email |
| DELETE | `/users/:id` | Permanently delete user |

### Truck Management
| Method | Route | Description |
|---|---|---|
| GET | `/trucks` | Paginated, filterable by status/type/country/search |
| PATCH | `/trucks/:id/verify` | Verify truck + email owner |
| PATCH | `/trucks/:id/suspend` | Set `isAvailable=false`, `isVerified=false` |

### Bookings & Disputes
| Method | Route | Description |
|---|---|---|
| GET | `/bookings` | Paginated, filterable by status/dateFrom/dateTo/search |
| GET | `/disputes` | All bookings with `status: disputed`, populated |
| PATCH | `/disputes/:id/resolve` | Set status to delivered, save admin notes, optionally email client + owner |

### Payments & Withdrawals
| Method | Route | Description |
|---|---|---|
| GET | `/payments` | Paginated transactions, filterable by type/status |
| GET | `/withdrawals` | All pending withdrawal transactions |
| PATCH | `/withdrawals/:id/approve` | Mark completed + email + SMS owner |
| PATCH | `/withdrawals/:id/reject` | Mark failed + refund wallet balance |

### Operations
| Method | Route | Description |
|---|---|---|
| POST | `/notify` | Broadcast to users (socket + email + SMS), target by role or country, chunked email in batches of 50 |
| GET | `/settings` | Return in-memory `platformConfig` object |
| PATCH | `/settings` | Merge-update `platformConfig` |
| POST | `/suggest-price` | Run `matching.suggestPrice(distance, vehicleType, cargo)` |
| POST | `/auto-assign/:bookingId` | Run `matching.autoAssign(bookingId)` |

---

## 📦 Complete `package.json`

**20 production dependencies:**

| Package | Version | Purpose |
|---|---|---|
| `express` | ^4.18.2 | Web framework |
| `mongoose` | ^8.0.0 | MongoDB ODM |
| `bcryptjs` | ^2.4.3 | Password hashing |
| `jsonwebtoken` | ^9.0.2 | JWT auth |
| `cors` | ^2.8.5 | CORS middleware |
| `dotenv` | ^16.3.1 | Environment variables |
| `express-validator` | ^7.0.1 | Input validation |
| `express-rate-limit` | ^7.1.0 | Rate limiting |
| `helmet` | ^7.1.0 | Security headers |
| `express-mongo-sanitize` | ^2.2.0 | NoSQL injection protection |
| `xss-clean` | ^0.1.4 | XSS protection |
| `hpp` | ^0.2.3 | HTTP parameter pollution |
| `morgan` | ^1.10.0 | HTTP logging |
| `nodemailer` | ^6.9.7 | Email sending |
| `africastalking` | ^0.8.0 | SMS (Africa's Talking) |
| `stripe` | ^14.0.0 | Card payments |
| `axios` | ^1.6.0 | HTTP client (M-Pesa/MTN) |
| `socket.io` | ^4.6.0 | Real-time websockets |
| `multer` | ^1.4.5-lts.1 | File uploads |
| `pdfkit` | ^0.14.0 | PDF generation |
| `uuid` | ^9.0.0 | UUID for MTN MoMo references |

**npm scripts:** `start`, `dev`, `test`, `lint`, `seed`, `seed:admin`, `docker:build`, `docker:up`, `docker:down`, `docker:logs`

---

## 🚀 Deployment Guide

### Stack Overview
| Layer | Technology |
|---|---|
| Runtime | Node.js 20 (Alpine) |
| Web framework | Express.js |
| Database | MongoDB 7 |
| Cache | Redis 7 |
| Reverse proxy | Nginx (Alpine) |
| Containerisation | Docker + Docker Compose |
| SSL | Let's Encrypt via Certbot |
| Process manager | dumb-init (Docker) |

### Docker Setup
**Dockerfile** — multi-stage build:
1. `builder` stage: `node:20-alpine`, installs only production deps with `npm ci --only=production`
2. `production` stage: copies built artifacts, creates non-root `itruck` user (uid 1001), exposes port 5000, healthcheck hits `/api/health`

**docker-compose.yml** — 5 services:
- `app` — Node.js server, depends on mongo + redis health checks, mounts uploads volume, structured logging (10MB, 5 files)
- `mongo` — MongoDB 7, persisted volume, init script, healthcheck via `mongosh ping`
- `redis` — Redis 7 Alpine, AOF persistence, 256MB LRU, healthcheck via `redis-cli ping`
- `nginx` — Nginx Alpine, ports 80+443, mounts frontend as static, SSL certs volume
- `certbot` — Let's Encrypt cert renewal (profile: ssl, run separately)

### Nginx Configuration
- HTTP → HTTPS 301 redirect (except `/.well-known/acme-challenge/`)
- TLS 1.2/1.3 only, ECDHE ciphers, OCSP stapling, 10min session cache
- Security headers: HSTS (2yr + preload), X-Frame-Options DENY, X-Content-Type nosniff, XSS protection, Referrer-Policy, Permissions-Policy (geolocation self only)
- Rate limit zones: `api` (60r/m), `auth` (10r/m), `conn` (20 connections)
- Gzip compression for all text types + JSON + SVG + fonts
- Static assets: 7-day cache + `immutable`
- API proxy: keepalive, WebSocket upgrade, real IP headers, 90s timeouts
- Socket.io proxy: 3600s read/write timeout (long-lived connections)
- Blocks: `.php`, `.asp`, `.env`, `.git` → 403

### Production `.env` Variables (25 total)
`NODE_ENV`, `PORT`, `APP_URL`, `ALLOWED_ORIGINS`, `DOMAIN`, `ADMIN_EMAIL`, `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRES`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE`, `MPESA_PASSKEY`, `MPESA_CALLBACK_URL`, `MPESA_ENV`, `MPESA_INITIATOR_NAME`, `MPESA_SECURITY_CREDENTIAL`, `MTN_SUBSCRIPTION_KEY`, `MTN_API_USER`, `MTN_API_KEY`, `MTN_ENV`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `AT_API_KEY`, `AT_USERNAME`, `MAPBOX_PUBLIC_TOKEN`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `REDIS_URL`

### Deploy Commands
```bash
# Local dev
cd backend && npm install && npm run seed && npm run dev

# Docker local
docker-compose up -d
docker-compose logs -f app

# VPS (Ubuntu 22.04)
curl -fsSL https://get.docker.com | sh
git clone https://github.com/yourname/itruck.git /var/www/itruck
cd /var/www/itruck
cp .env.example .env.production && nano .env.production
docker-compose --profile ssl run certbot   # Get SSL cert first
docker-compose up -d

# Railway (1-click)
npm install -g @railway/cli && railway login && railway init && railway up

# Render
# Connect GitHub → New Web Service → Build: cd backend && npm install → Start: node server.js

# Update production
git pull origin main
docker-compose build app
docker-compose up -d --no-deps app
```

### Database Seed
`scripts/seed.js` creates:
- 1 admin: `admin@itruck.africa` / `Admin2025!`
- 3 clients: Amina (GH), Tunde (NG), Sipho (ZA) — password: `Demo2025!`
- 3 owners: James (KE, verified), Grace (KE, verified), Kwame (GH, unverified)
- 3 trucks: Isuzu FVZ 34 (verified), Scania R450 (verified), Mitsubishi Canter (pending)

---

**Countries with dialcode in signup:**
Kenya (+254) · Nigeria (+234) · South Africa (+27) · Uganda (+256) · Tanzania (+255) · Ghana (+233) · Egypt (+20) · Morocco (+212) · Ethiopia (+251) · DRC Congo (+243)

**Coverage claim:** All 54 African nations (via route intelligence layer)

**Languages referenced:** English, Français, Kiswahili, Hausa, Yoruba, Amharic, العربية

---

## ✅ What's Done / ⬜ What's Next

### Done ✅

**Frontend — Pages (9)**
- [x] Homepage + dual signup + login modals
- [x] Client dashboard (4 sections + slide panel)
- [x] Owner dashboard (7 sections + earnings chart + modals)
- [x] 5-step booking wizard (full flow + success screen)
- [x] Live tracking page (map + detail panel + chat + simulation)
- [x] Truck listings (filters + sort + pagination + detail modal)
- [x] Profile page (6 tabs + document upload + security + preferences)
- [x] Admin panel (10 sections — dashboard, analytics, users, trucks, bookings, disputes, payments, withdrawals, settings, audit logs, notifications)

**Frontend — CSS (7)**
- [x] `styles.css` — global design system, variables, components, homepage
- [x] `dashboard.css` — sidebar, topbar, stat cards, tables, modals
- [x] `tracking.css` — map layout, detail panel, chat, timeline
- [x] `listings.css` — search hero, filter panel, truck cards, pagination
- [x] `booking.css` — wizard progress, vehicle grid, cargo flags, confirm layout
- [x] `profile.css` — banner, tabs, document cards, reviews, security, preferences
- [x] `admin.css` — KPI grid, chart cards, dispute cards, withdrawal cards, settings

**Frontend — JavaScript (15)**
- [x] `main.js` — homepage modals, counters, tabs, particles
- [x] `dashboard-client.js` — all sections, mock data, quick book, detail panel
- [x] `dashboard-owner.js` — all sections, earnings chart, bid/vehicle modals
- [x] `tracking.js` — shipment list, detail panel, live simulation, chat
- [x] `listings.js` — filter/sort/search, truck cards, pagination, detail modal
- [x] `booking.js` — 5-step wizard, autocomplete, cargo flags, payment selection
- [x] `profile.js` — 6 tabs, form editing, document upload, session management
- [x] `admin.js` — KPI counters, 5 canvas charts + 6 sparklines, all 19 render/action/filter/nav functions
- [x] `socket-client.js` — `iTruckSocket` class, GPS tracking, chat, bids, browser push, event bus
- [x] `maps.js` — `iTruckMaps` class, markers, truck animation, route drawing, geocoding, heatmap, fallback
- [x] `pwa.js` — SW registration, install prompt, push subscription, update + offline banners
- [x] `api.js` — `iTruckAPI` singleton, 8 namespaced groups, 60+ typed methods, interceptors
- [x] `auth-guard.js` — IIFE route protection, role-based redirects, UI auto-population
- [x] `notifications-ui.js` — `NotificationsUI` class, slide panel, socket integration, pagination
- [x] `rating.js` — star component, auto-open on delivery, socket + URL trigger

**Frontend — PWA**
- [x] `manifest.json` — 8 icon sizes, 3 shortcuts, standalone display
- [x] `sw.js` — 3 cache buckets, push handler, notification click, background sync, periodic sync

**Backend — Models (5)**
- [x] `User.js` — client + owner + admin, bcrypt, JWT methods, wallet balance, OTP fields, push subscription
- [x] `Truck.js` — all vehicle types, features, location, pricing, documents
- [x] `Booking.js` — full lifecycle, bids array, tracking history, ratings
- [x] `Transaction.js` — 5 types, 6 methods, indexed
- [x] `Notification.js` — 23 types, TTL auto-delete, priority, channels, static methods

**Backend — Routes (9)**
- [x] `auth.js` — register owner/client, login, verify token
- [x] `bookings.js` — CRUD, bid, accept, rate, status + tracking
- [x] `trucks.js` — CRUD, fleet, public filter
- [x] `users.js` — profile, password, push sub
- [x] `payments.js` — Stripe, M-Pesa, MTN, wallet, transactions, webhook
- [x] `documents.js` — waybill, customs, invoice (PDF streaming)
- [x] `notifications.js` — get, count, mark read, delete, push sub
- [x] `upload.js` — avatar, truck photos, cargo, documents via Cloudinary
- [x] `admin.js` — 20 endpoints: stats, analytics, users CRUD, trucks, bookings, disputes, payments, withdrawals, broadcast, settings, price suggestion, auto-assign

**Backend — Services (7)**
- [x] `payment.js` — StripeService, MpesaService (STK + B2C), MTNMoMoService, WalletService
- [x] `email.js` — Nodemailer, 7 dark HTML templates
- [x] `sms.js` — Africa's Talking, 10 templates, bulk SMS, OTP generate/send/verify
- [x] `documents.js` — PDFKit waybill, customs declaration, commercial invoice
- [x] `matching.js` — score matching, auto-assign, price suggestion, route optimisation, demand forecasting
- [x] `cloudinary.js` — upload, delete, signed URLs, 5 transformation presets
- [x] `notifications.js` — 23 templates, deliver(), notifyBookingParties(), getAll()

**Backend — Infrastructure**
- [x] `server.js` — final production, graceful shutdown, SIGTERM/SIGINT, all 9 routes mounted
- [x] `socket/index.js` — Redis adapter, JWT auth middleware, GPS rooms, chat history, bids, presence
- [x] `middleware/auth.js` — JWT protect, role restrict
- [x] `middleware/security.js` — CORS, Helmet CSP, 4 rate limiters, sanitize, Multer, error handler
- [x] `scripts/seed.js` — admin + 3 clients + 3 owners + 3 trucks, hashed passwords

**Testing (48 tests)**
- [x] `tests/auth.test.js` — 12 tests
- [x] `tests/bookings.test.js` — 14 tests
- [x] `tests/payments.test.js` — 10 tests
- [x] `tests/notifications.test.js` — 12 tests

**DevOps**
- [x] `Dockerfile` — multi-stage node:20-alpine, dumb-init, non-root user, healthcheck
- [x] `docker-compose.yml` — 5 services: app, MongoDB 7, Redis 7, Nginx, Certbot
- [x] `nginx/nginx.conf` — TLS 1.2/1.3, gzip, rate zones, Socket.io proxy, security headers
- [x] `.env.production` — all 34 variables documented
- [x] `package.json` — 20 production + 3 dev dependencies, 9 npm scripts
- [x] `.github/workflows/ci-cd.yml` — 4 jobs: lint → test → build → deploy
- [x] `.github/workflows/pr-checks.yml` — runs on every PR

### To Build ⬜
- [ ] Wire all frontend pages to real backend (replace all mock data with `window.API.*` calls)
- [ ] Connect `iTruckSocket` live to tracking page, dashboards, booking wizard
- [ ] Integrate `iTruckMaps` into tracking page and listings browse view
- [ ] VAPID key generation + server-side push notification send endpoint
- [ ] Cross-border documentation UI — auto-generate waybill on booking confirmation
- [ ] Stripe connected accounts — owner onboarding + automatic payouts
- [ ] Redis OTP cache — move OTP from User model to Redis with TTL
- [ ] Sentry error monitoring — production error tracking
- [ ] `.gitignore` — prevent committing `.env`, `node_modules`, uploads
- [ ] `scripts/createAdmin.js` — standalone admin creation script (referenced in package.json)
- [ ] `scripts/mongo-init.js` — Docker mongo init script (referenced in docker-compose)

---

*Last updated — All sections from Google Doc added: api.js, auth-guard.js, notifications-ui.js, rating.js, Notification model, notification routes/service, Cloudinary service, upload routes, 4 test suites (48 tests), CI/CD pipelines, complete project stats + tech stack · iTruck Africa Ltd*
