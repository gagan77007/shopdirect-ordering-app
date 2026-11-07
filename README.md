# ShopDirect — Single-Shop Ordering & Owner Management App

A production-ready, mobile-first ordering and store management web application built for a single local shop. Combines the customer storefront and owner administration console into one unified application with role-based access control, real-time cart calculations, atomic stock reservation, and order lifecycle tracking.

---

## Key Features

### Customer Experience
- **Guest Browsing**: Browse categories, search products, filter by stock/offers, and build a cart without forced login.
- **Dynamic Product Catalogue**: Category-filtered sections (*Popular*, *Today's Offers*, *New Arrivals*), product variants (weight, pack size, quantity), discount badges, and low-stock indicators.
- **Smart Cart & Coupons**: Automatic quantity consolidation, stock-limit enforcement, free-delivery progress bar, and backend-validated promotional coupons (`WELCOME50`, `FESTIVE15`, `FREESHIP`).
- **Flexible Checkout**: Supports both **Home Delivery** (with supported pincode verification, minimum order check, and saved addresses) and **Store Pickup** (with preparation time estimates and counter instructions).
- **Multi-Mode Payments**: Configurable support for **UPI / QR**, **Online Payment Gateway**, **Cash on Delivery (COD)**, and **Pay at Store**, including safe payment retry on failed transactions without duplicating orders.
- **Live Order Tracking & Cancellation**: Visual timeline from *Order Placed* to *Completed*, stage-based customer cancellation with automatic stock restoration, and one-tap Call / WhatsApp store contact with pre-filled Order ID.

### Unified Owner & Admin Console
- **Single Login System**: No separate admin login screen or exposed staff buttons. When the authorized store owner signs in through the standard login modal, the backend verifies `role === 'owner'` and unlocks the **Admin Dashboard** inside the Profile screen.
- **Dashboard & Analytics**: Today's revenue (excluding cancelled/rejected orders), active order counts, low-stock alerts, 7-day sales trend chart, and top-selling product leaderboard.
- **Order Pipeline Controls**: Accept, Reject (with mandatory reason), Start Preparing, Dispatch / Mark Ready for Pickup, and Complete orders.
- **Catalogue & Inventory Management**: Add/edit products, configure variants, adjust stock levels inline, and manage categories, discount coupons, and promotional hero banners.
- **Store Settings & Status**: Update shop name, contact details, supported delivery pincodes, delivery fees, enabled payment methods, and live store status (**OPEN**, **CLOSED**, or **PAUSED**).

---

## Tech Stack

- **Frontend**: React 19, TypeScript, HTML, Tailwind CSS v4, Lucide Icons, Canvas Confetti
- **Backend**: Node.js, Express, TypeScript (`tsx` in development, native Node TypeScript execution in production)
- **Persistence & Concurrency**: JSON file-backed storage (`data/shop_data.json`) with an asynchronous mutex lock (`AsyncLock`) to prevent stock race conditions when multiple customers purchase the last unit simultaneously

---

## Getting Started Locally

### Prerequisites
- **Node.js** v20+ (v22 LTS recommended)
- **npm** v9+

### Installation & Local Development

1. **Clone the repository**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/shopdirect-ordering-app.git
   cd shopdirect-ordering-app
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables (optional)**:
   ```bash
   cp .env.example .env
   ```

4. **Start the development server**:
   ```bash
   npm run dev
   ```

5. **Open in browser**:
   Navigate to [http://localhost:3000](http://localhost:3000)

---

## Demo Login Credentials

Use the **Login** button in the top header (or the quick-fill buttons inside the sign-in modal) to test both roles through the same login screen:

| Role | Email / Identifier | Password | Access Level |
| :--- | :--- | :--- | :--- |
| **Customer** | `customer@example.com` (or `9123456780`) | `customer123` | Standard storefront, cart, checkout, order tracking, saved addresses |
| **Store Owner** | `owner@shop.com` (or `9876543210`) | `owner123` | All customer features + **Admin Dashboard** in Profile |

---

## Production Build

To build the frontend bundle and run the production server:

```bash
npm run build
npm start
```

---

## Project Structure

```text
├── data/
│   └── shop_data.json          # Persistent store data (users, products, orders, settings)
├── src/
│   ├── components/             # Reusable UI components (Header, BottomNav, ProductCard, AuthModal, etc.)
│   ├── context/
│   │   └── AppContext.tsx      # Global state for auth, cart, catalogue, and navigation
│   ├── screens/                # Customer & Admin screens (Home, Cart, Checkout, OrderTrack, Admin, etc.)
│   ├── types/
│   │   └── index.ts            # Shared TypeScript interfaces
│   ├── App.tsx                 # Main screen router and layout shell
│   ├── index.css               # Tailwind CSS v4 imports and typography rules
│   └── main.tsx                # React DOM entry point
├── index.html                  # HTML entry point
├── package.json                # Scripts and dependencies
├── server.ts                   # Express API server, auth middleware, and atomic stock lock
├── tsconfig.json               # TypeScript configuration
└── vite.config.ts              # Vite bundler configuration
```
