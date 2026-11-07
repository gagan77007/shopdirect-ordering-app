import express, { type Request, type Response, type NextFunction } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import type { 
  User, 
  ShopSettings, 
  Category, 
  Product, 
  Coupon, 
  Banner, 
  Order, 
  AppNotification, 
  DashboardMetrics,
  OrderItemSnapshot,
  OrderStatusType,
  PaymentStatusType
} from './src/types/index.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Mutex lock for stock race condition handling
class AsyncLock {
  private queue: (() => void)[] = [];
  private locked = false;

  async acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const execute = () => {
        this.locked = true;
        resolve(() => {
          this.locked = false;
          const next = this.queue.shift();
          if (next) next();
        });
      };

      if (!this.locked) {
        execute();
      } else {
        this.queue.push(execute);
      }
    });
  }
}

const stockLock = new AsyncLock();

// Data persistence file path
const DATA_DIR = path.resolve(__dirname, 'data');
const DATA_FILE = path.resolve(DATA_DIR, 'shop_data.json');

interface DatabaseSchema {
  users: (User & { passwordHash?: string })[];
  settings: ShopSettings;
  categories: Category[];
  products: Product[];
  coupons: Coupon[];
  banners: Banner[];
  orders: Order[];
  notifications: AppNotification[];
}

// Initial Seed Data with editable placeholders and rich shop defaults
const defaultSeedData: DatabaseSchema = {
  users: [
    {
      id: 'usr_owner_1',
      name: 'Shop Owner',
      phone: '9876543210',
      email: 'owner@shop.com',
      passwordHash: 'owner123',
      role: 'owner',
      addresses: [
        {
          id: 'addr_owner_1',
          label: 'Work',
          recipientName: 'Shop Owner',
          phone: '9876543210',
          addressLine: '42 Market Street, Indiranagar',
          landmark: 'Opposite Metro Pillar 84',
          city: 'Bengaluru',
          pincode: '560038',
          isDefault: true
        }
      ],
      favorites: ['prod_1', 'prod_4'],
      createdAt: new Date(Date.now() - 30 * 86400000).toISOString()
    },
    {
      id: 'usr_cust_1',
      name: 'Priya Sharma',
      phone: '9123456780',
      email: 'customer@example.com',
      passwordHash: 'customer123',
      role: 'customer',
      addresses: [
        {
          id: 'addr_cust_1',
          label: 'Home',
          recipientName: 'Priya Sharma',
          phone: '9123456780',
          addressLine: 'Apartment 4B, Silver Oak Heights, 12th Main',
          landmark: 'Near BDA Complex',
          city: 'Bengaluru',
          pincode: '560038',
          isDefault: true
        }
      ],
      favorites: ['prod_2', 'prod_3'],
      createdAt: new Date(Date.now() - 15 * 86400000).toISOString()
    }
  ],
  settings: {
    name: 'GreenLeaf Provisions & Daily Fresh [SHOP NAME]',
    type: 'Boutique Grocery & Daily Essentials [SHOP TYPE]',
    logo: '🌿 GreenLeaf',
    phone: '+91 98765 43210',
    whatsapp: '+91 98765 43210',
    address: '42 Market Street, 100ft Road, Indiranagar, Bengaluru 560038',
    openingHours: 'Mon - Sun: 7:00 AM - 10:30 PM',
    status: 'OPEN',
    statusMessage: '',
    deliveryEnabled: true,
    supportedPincodes: ['560038', '560008', '560075', '560001', '560042'],
    deliveryFee: 35,
    minOrderAmount: 149,
    freeDeliveryThreshold: 499,
    estimatedDeliveryTime: '30-45 mins',
    pickupEnabled: true,
    estimatedPrepTime: '15-20 mins',
    pickupInstructions: 'Pick up at our quick-service counter with your 4-digit Order ID',
    paymentMethods: {
      upi: true,
      online: true,
      cod: true,
      payAtStore: true
    },
    upiId: 'greenleaf@okaxis',
    upiQrCodeUrl: '',
    cancellationAllowedStages: ['PLACED', 'ACCEPTED']
  },
  categories: [
    { id: 'cat_fresh', name: 'Fresh Fruits & Veg', slug: 'fresh', icon: 'Apple', color: 'emerald', order: 1, status: 'ACTIVE' },
    { id: 'cat_dairy', name: 'Dairy & Bakery', slug: 'dairy-bakery', icon: 'Milk', color: 'amber', order: 2, status: 'ACTIVE' },
    { id: 'cat_staples', name: 'Gourmet Staples', slug: 'staples', icon: 'Wheat', color: 'orange', order: 3, status: 'ACTIVE' },
    { id: 'cat_snacks', name: 'Beverages & Snacks', slug: 'snacks', icon: 'Coffee', color: 'rose', order: 4, status: 'ACTIVE' },
    { id: 'cat_organic', name: 'Organic & Spices', slug: 'organic', icon: 'Sparkles', color: 'teal', order: 5, status: 'ACTIVE' }
  ],
  products: [
    {
      id: 'prod_1',
      name: 'Kashmiri Crisp Apples (Royal Delicious)',
      category: 'cat_fresh',
      description: 'Handpicked sweet, crisp orchard apples from Himalayan slopes. Rich in antioxidants and natural sweetness.',
      image: '',
      price: 180,
      originalPrice: 220,
      stock: 24,
      lowStockThreshold: 5,
      variants: [
        { id: 'var_1_1', name: '1 kg Box', type: 'Weight', price: 180, originalPrice: 220, stock: 16 },
        { id: 'var_1_2', name: '2 kg Family Pack', type: 'Weight', price: 340, originalPrice: 420, stock: 8 }
      ],
      featured: true,
      offer: true,
      rating: 4.8,
      reviewCount: 42,
      status: 'ACTIVE',
      unit: 'kg',
      prepTime: 'Instant'
    },
    {
      id: 'prod_2',
      name: 'Artisan Wood-Fired Sourdough Loaf',
      category: 'cat_dairy',
      description: 'Slow-fermented for 24 hours with natural wild yeast starter. Crispy blistered crust with airy chewy crumb.',
      image: '',
      price: 140,
      originalPrice: 165,
      stock: 12,
      lowStockThreshold: 4,
      variants: [
        { id: 'var_2_1', name: '450g Loaf (Sliced)', type: 'Size', price: 140, originalPrice: 165, stock: 7 },
        { id: 'var_2_2', name: '450g Loaf (Whole)', type: 'Size', price: 140, originalPrice: 165, stock: 5 }
      ],
      featured: true,
      offer: true,
      rating: 4.9,
      reviewCount: 58,
      status: 'ACTIVE',
      unit: 'loaf',
      prepTime: 'Instant'
    },
    {
      id: 'prod_3',
      name: 'A2 Vedic Desi Cow Bilona Ghee',
      category: 'cat_dairy',
      description: 'Traditional earthen pot churned A2 butter ghee. Golden granular texture with rich nutty aroma and high smoke point.',
      image: '',
      price: 699,
      originalPrice: 850,
      stock: 15,
      lowStockThreshold: 3,
      variants: [
        { id: 'var_3_1', name: '500 ml Glass Jar', type: 'Quantity', price: 699, originalPrice: 850, stock: 10 },
        { id: 'var_3_2', name: '1000 ml Glass Jar', type: 'Quantity', price: 1320, originalPrice: 1650, stock: 5 }
      ],
      featured: true,
      offer: false,
      rating: 4.95,
      reviewCount: 76,
      status: 'ACTIVE',
      unit: 'jar',
      prepTime: 'Instant'
    },
    {
      id: 'prod_4',
      name: 'Organic Hass Avocados',
      category: 'cat_fresh',
      description: 'Creamy Hass avocados ripened to perfection. Ideal for morning toast, guacamole, salads and bowls.',
      image: '',
      price: 190,
      originalPrice: 240,
      stock: 18,
      lowStockThreshold: 4,
      variants: [
        { id: 'var_4_1', name: 'Pack of 2 (Semi-Ripe)', type: 'Pack', price: 190, originalPrice: 240, stock: 10 },
        { id: 'var_4_2', name: 'Pack of 2 (Ready to Eat)', type: 'Pack', price: 195, originalPrice: 250, stock: 8 }
      ],
      featured: true,
      offer: true,
      rating: 4.7,
      reviewCount: 31,
      status: 'ACTIVE',
      unit: 'pack',
      prepTime: 'Instant'
    },
    {
      id: 'prod_5',
      name: 'Cold-Pressed Extra Virgin Coconut Oil',
      category: 'cat_staples',
      description: 'Sourced from organic coastal Kerala coconuts. Pure, unrefined, zero chemical processing.',
      image: '',
      price: 285,
      originalPrice: 330,
      stock: 20,
      lowStockThreshold: 4,
      variants: [
        { id: 'var_5_1', name: '500 ml Bottle', type: 'Quantity', price: 285, originalPrice: 330, stock: 14 },
        { id: 'var_5_2', name: '1 Litre Tin', type: 'Quantity', price: 540, originalPrice: 620, stock: 6 }
      ],
      featured: false,
      offer: false,
      rating: 4.8,
      reviewCount: 22,
      status: 'ACTIVE',
      unit: 'bottle'
    },
    {
      id: 'prod_6',
      name: 'Single Estate Arabica Coffee Beans',
      category: 'cat_snacks',
      description: 'Shade-grown in Chikmagalur hills at 4,000 ft altitude. Tasting notes of dark cocoa and caramel orange peel.',
      image: '',
      price: 360,
      originalPrice: 420,
      stock: 22,
      lowStockThreshold: 5,
      variants: [
        { id: 'var_6_1', name: '250g Medium Roast (Beans)', type: 'Size', price: 360, originalPrice: 420, stock: 12 },
        { id: 'var_6_2', name: '250g Medium Roast (Ground)', type: 'Size', price: 360, originalPrice: 420, stock: 10 }
      ],
      featured: true,
      offer: false,
      rating: 4.9,
      reviewCount: 38,
      status: 'ACTIVE',
      unit: 'pack'
    },
    {
      id: 'prod_7',
      name: 'Stone-Ground 100% Whole Wheat Sharbati Atta',
      category: 'cat_staples',
      description: 'Traditional chakki-milled from MP Sharbati golden grains. Produces exceptionally soft, nutritious rotis.',
      image: '',
      price: 280,
      originalPrice: 320,
      stock: 30,
      lowStockThreshold: 6,
      variants: [
        { id: 'var_7_1', name: '5 kg Eco Bag', type: 'Weight', price: 280, originalPrice: 320, stock: 20 },
        { id: 'var_7_2', name: '10 kg Saver Pack', type: 'Weight', price: 540, originalPrice: 620, stock: 10 }
      ],
      featured: false,
      offer: false,
      rating: 4.85,
      reviewCount: 64,
      status: 'ACTIVE',
      unit: 'bag'
    },
    {
      id: 'prod_8',
      name: 'Handcrafted Roasted Almond & Cranberry Granola',
      category: 'cat_snacks',
      description: 'Rolled jumbo oats baked with California almonds, wild cranberries, and pure mountain blossom honey.',
      image: '',
      price: 320,
      originalPrice: 380,
      stock: 14,
      lowStockThreshold: 4,
      variants: [
        { id: 'var_8_1', name: '350g Resealable Pouch', type: 'Size', price: 320, originalPrice: 380, stock: 14 }
      ],
      featured: true,
      offer: true,
      rating: 4.75,
      reviewCount: 29,
      status: 'ACTIVE',
      unit: 'pouch'
    },
    {
      id: 'prod_9',
      name: 'Wild Multifloral Raw Forest Honey',
      category: 'cat_organic',
      description: 'Raw, unpasteurized honey gathered by tribal beekeepers in Western Ghats reserves. Retains all live enzymes.',
      image: '',
      price: 450,
      originalPrice: 520,
      stock: 16,
      lowStockThreshold: 3,
      variants: [
        { id: 'var_9_1', name: '400g Glass Jar', type: 'Weight', price: 450, originalPrice: 520, stock: 16 }
      ],
      featured: false,
      offer: false,
      rating: 4.92,
      reviewCount: 47,
      status: 'ACTIVE',
      unit: 'jar'
    },
    {
      id: 'prod_10',
      name: 'Hydroponic English Cucumbers',
      category: 'cat_fresh',
      description: 'Pesticide-free crisp greenhouse cucumbers. Thin skin, minimal seeds, ideal for cooling juices and salads.',
      image: '',
      price: 65,
      originalPrice: 85,
      stock: 28,
      lowStockThreshold: 5,
      variants: [
        { id: 'var_10_1', name: '500g Pack (2-3 pcs)', type: 'Weight', price: 65, originalPrice: 85, stock: 28 }
      ],
      featured: false,
      offer: true,
      rating: 4.6,
      reviewCount: 19,
      status: 'ACTIVE',
      unit: 'pack'
    },
    {
      id: 'prod_11',
      name: 'Organic Malabar Black Peppercorns',
      category: 'cat_organic',
      description: 'Bold TGSEB grade peppercorns harvested from Wayanad vines. High piperine content with pungent floral heat.',
      image: '',
      price: 210,
      originalPrice: 250,
      stock: 25,
      lowStockThreshold: 5,
      variants: [
        { id: 'var_11_1', name: '200g Jar', type: 'Weight', price: 210, originalPrice: 250, stock: 25 }
      ],
      featured: false,
      offer: false,
      rating: 4.88,
      reviewCount: 15,
      status: 'ACTIVE',
      unit: 'jar'
    },
    {
      id: 'prod_12',
      name: 'Farm Fresh Paneer (Cottage Cheese)',
      category: 'cat_dairy',
      description: 'Soft, melt-in-mouth cottage cheese crafted daily from whole buffalo milk. High protein, zero preservatives.',
      image: '',
      price: 110,
      originalPrice: 130,
      stock: 3, // Low stock demo!
      lowStockThreshold: 5,
      variants: [
        { id: 'var_12_1', name: '200g Vacuum Pack', type: 'Weight', price: 110, originalPrice: 130, stock: 3 }
      ],
      featured: true,
      offer: true,
      rating: 4.9,
      reviewCount: 82,
      status: 'ACTIVE',
      unit: 'pack'
    }
  ],
  coupons: [
    {
      id: 'coup_1',
      code: 'WELCOME50',
      title: 'Flat ₹50 Off First Order',
      description: 'Save flat ₹50 on minimum shopping of ₹299',
      discountType: 'FIXED',
      discountValue: 50,
      minOrder: 299,
      validFrom: new Date(Date.now() - 30 * 86400000).toISOString(),
      validTo: new Date(Date.now() + 60 * 86400000).toISOString(),
      usageLimit: 500,
      usedCount: 28,
      active: true
    },
    {
      id: 'coup_2',
      code: 'FESTIVE15',
      title: '15% Off Up to ₹150',
      description: 'Enjoy 15% discount on all purchases above ₹499',
      discountType: 'PERCENTAGE',
      discountValue: 15,
      minOrder: 499,
      maxDiscount: 150,
      validFrom: new Date(Date.now() - 10 * 86400000).toISOString(),
      validTo: new Date(Date.now() + 30 * 86400000).toISOString(),
      usageLimit: 300,
      usedCount: 64,
      active: true
    },
    {
      id: 'coup_3',
      code: 'FREESHIP',
      title: 'Free Delivery',
      description: 'Get 100% free home delivery on orders over ₹249',
      discountType: 'FIXED',
      discountValue: 35,
      minOrder: 249,
      validFrom: new Date(Date.now() - 5 * 86400000).toISOString(),
      validTo: new Date(Date.now() + 45 * 86400000).toISOString(),
      usageLimit: 1000,
      usedCount: 92,
      active: true
    }
  ],
  banners: [
    {
      id: 'ban_1',
      title: 'Freshly Harvested Today',
      subtitle: 'Premium apples, berries & hydroponic greens delivered in 45 mins',
      badge: 'Farm Direct',
      bgColor: 'from-emerald-700 via-emerald-800 to-teal-900',
      textColor: 'text-white',
      accentColor: '#10b981',
      linkType: 'category',
      linkTarget: 'cat_fresh',
      active: true,
      order: 1
    },
    {
      id: 'ban_2',
      title: 'Warm Sourdough & Artisanal Bakery',
      subtitle: 'Slow-fermented European breads baked fresh every dawn',
      badge: 'Morning Special',
      bgColor: 'from-amber-700 via-orange-800 to-stone-900',
      textColor: 'text-white',
      accentColor: '#f59e0b',
      linkType: 'category',
      linkTarget: 'cat_dairy',
      active: true,
      order: 2
    },
    {
      id: 'ban_3',
      title: 'Free Delivery On ₹499+',
      subtitle: 'Zero delivery fee on all orders across Bangalore neighbourhoods',
      badge: 'Shop Offer',
      bgColor: 'from-indigo-800 via-purple-900 to-slate-900',
      textColor: 'text-white',
      accentColor: '#6366f1',
      linkType: 'offer',
      linkTarget: 'FREESHIP',
      active: true,
      order: 3
    }
  ],
  orders: [
    {
      id: 'ord_1021',
      orderNumber: 'ORD-1021',
      customerId: 'usr_cust_1',
      customerName: 'Priya Sharma',
      customerPhone: '9123456780',
      customerEmail: 'customer@example.com',
      items: [
        {
          productId: 'prod_1',
          variantId: 'var_1_1',
          productName: 'Kashmiri Crisp Apples (Royal Delicious)',
          variantName: '1 kg Box',
          price: 180,
          originalPrice: 220,
          quantity: 1,
          image: ''
        },
        {
          productId: 'prod_2',
          variantId: 'var_2_1',
          productName: 'Artisan Wood-Fired Sourdough Loaf',
          variantName: '450g Loaf (Sliced)',
          price: 140,
          originalPrice: 165,
          quantity: 1,
          image: ''
        }
      ],
      orderMethod: 'DELIVERY',
      deliveryAddress: {
        id: 'addr_cust_1',
        label: 'Home',
        recipientName: 'Priya Sharma',
        phone: '9123456780',
        addressLine: 'Apartment 4B, Silver Oak Heights, 12th Main',
        landmark: 'Near BDA Complex',
        city: 'Bengaluru',
        pincode: '560038'
      },
      deliveryInstructions: 'Leave with security guard if not answering bell',
      paymentMethod: 'UPI',
      paymentStatus: 'PAID',
      orderStatus: 'COMPLETED',
      subtotal: 320,
      productDiscount: 65,
      couponCode: 'WELCOME50',
      couponDiscount: 50,
      deliveryFee: 0,
      tax: 0,
      finalTotal: 270,
      notes: 'Please pack apples with cushioning',
      createdAt: new Date(Date.now() - 48 * 3600000).toISOString(),
      updatedAt: new Date(Date.now() - 46 * 3600000).toISOString(),
      timeline: [
        { stage: 'PLACED', timestamp: new Date(Date.now() - 48 * 3600000).toISOString(), title: 'Order Placed', note: 'Paid via UPI' },
        { stage: 'ACCEPTED', timestamp: new Date(Date.now() - 47.8 * 3600000).toISOString(), title: 'Order Accepted by Store' },
        { stage: 'PREPARING', timestamp: new Date(Date.now() - 47.5 * 3600000).toISOString(), title: 'Order Packed & Ready for Dispatch' },
        { stage: 'OUT_FOR_DELIVERY', timestamp: new Date(Date.now() - 47 * 3600000).toISOString(), title: 'Out for Delivery' },
        { stage: 'COMPLETED', timestamp: new Date(Date.now() - 46 * 3600000).toISOString(), title: 'Delivered Successfully' }
      ]
    },
    {
      id: 'ord_1022',
      orderNumber: 'ORD-1022',
      customerId: 'usr_cust_1',
      customerName: 'Priya Sharma',
      customerPhone: '9123456780',
      customerEmail: 'customer@example.com',
      items: [
        {
          productId: 'prod_3',
          variantId: 'var_3_1',
          productName: 'A2 Vedic Desi Cow Bilona Ghee',
          variantName: '500 ml Glass Jar',
          price: 699,
          originalPrice: 850,
          quantity: 1,
          image: ''
        }
      ],
      orderMethod: 'PICKUP',
      pickupTimeSlot: 'Today 5:00 PM - 6:00 PM',
      paymentMethod: 'PAY_AT_STORE',
      paymentStatus: 'PENDING',
      orderStatus: 'ACCEPTED',
      subtotal: 699,
      productDiscount: 151,
      couponDiscount: 0,
      deliveryFee: 0,
      tax: 0,
      finalTotal: 699,
      createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
      updatedAt: new Date(Date.now() - 1.8 * 3600000).toISOString(),
      timeline: [
        { stage: 'PLACED', timestamp: new Date(Date.now() - 2 * 3600000).toISOString(), title: 'Order Placed for Store Pickup' },
        { stage: 'ACCEPTED', timestamp: new Date(Date.now() - 1.8 * 3600000).toISOString(), title: 'Order Accepted by Store' }
      ]
    }
  ],
  notifications: [
    {
      id: 'notif_1',
      recipientId: 'usr_cust_1',
      title: 'Order Delivered!',
      message: 'Your order #ORD-1021 has been delivered. Enjoy fresh gourmet goodness!',
      type: 'order',
      orderId: 'ord_1021',
      read: false,
      createdAt: new Date(Date.now() - 46 * 3600000).toISOString()
    },
    {
      id: 'notif_2',
      recipientId: 'admin',
      title: 'New Store Pickup Order #ORD-1022',
      message: 'Priya Sharma placed an order for ₹699 (Store Pickup).',
      type: 'order',
      orderId: 'ord_1022',
      read: false,
      createdAt: new Date(Date.now() - 2 * 3600000).toISOString()
    },
    {
      id: 'notif_3',
      recipientId: 'admin',
      title: 'Low Stock Alert: Farm Fresh Paneer',
      message: 'Only 3 units left in stock. Consider restocking soon.',
      type: 'stock',
      read: false,
      createdAt: new Date(Date.now() - 1 * 3600000).toISOString()
    }
  ]
};

// Database Memory Cache & Persistence
let db: DatabaseSchema = JSON.parse(JSON.stringify(defaultSeedData));

function loadDb() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      db = {
        ...defaultSeedData,
        ...parsed,
        settings: { ...defaultSeedData.settings, ...(parsed.settings || {}) }
      };
      console.log('Database loaded from persistent file');
    } else {
      saveDb();
    }
  } catch (err) {
    console.error('Error loading db file, using seed:', err);
  }
}

function saveDb() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving db file:', err);
  }
}

loadDb();

// Simple Bearer Token Auth helper
// Token format: base64(userId:role:timestamp)
function generateToken(user: User): string {
  const payload = `${user.id}:${user.role}:${Date.now()}`;
  return Buffer.from(payload).toString('base64');
}

function parseToken(tokenStr?: string): { userId: string; role: string } | null {
  if (!tokenStr) return null;
  try {
    const raw = tokenStr.replace(/^Bearer\s+/i, '');
    const decoded = Buffer.from(raw, 'base64').toString('utf-8');
    const [userId, role] = decoded.split(':');
    if (!userId || !role) return null;
    return { userId, role };
  } catch {
    return null;
  }
}

// Authentication & Role Check Middleware
interface AuthenticatedRequest extends Request {
  user?: User;
}

function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return next();
  }
  const tokenData = parseToken(authHeader);
  if (!tokenData) {
    return next();
  }
  const user = db.users.find(u => u.id === tokenData.userId);
  if (user) {
    req.user = user;
  }
  next();
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required. Please login.' });
  }
  next();
}

function requireOwner(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required. Please login.' });
  }
  // Secure backend check: strictly verify role in database record
  const dbUser = db.users.find(u => u.id === req.user?.id);
  if (!dbUser || dbUser.role !== 'owner') {
    return res.status(403).json({ error: 'Access Denied: Owner administrator privileges required.' });
  }
  next();
}

app.use(authenticate);

// ==========================================
// PUBLIC & STOREFRONT API ENDPOINTS
// ==========================================

// Live visitor & page view tracking
const activeVisitorTimestamps = new Map<string, number>();
let totalStoreViews = 48;
let todayStoreViews = 14;
let lastTrackedDate = new Date().toISOString().split('T')[0];

function recordStoreVisit(req: Request) {
  const today = new Date().toISOString().split('T')[0];
  if (today !== lastTrackedDate) {
    todayStoreViews = 0;
    lastTrackedDate = today;
  }
  const visitorKey = `${req.ip || 'local'}_${req.headers['user-agent'] || 'browser'}`;
  const now = Date.now();
  const prev = activeVisitorTimestamps.get(visitorKey);
  // Count as a new page view if first visit or >60s since last ping
  if (!prev || now - prev > 60000) {
    todayStoreViews += 1;
    totalStoreViews += 1;
  }
  activeVisitorTimestamps.set(visitorKey, now);
}

// GET Shop Settings & Status
app.get('/api/shop/settings', (req: Request, res: Response) => {
  recordStoreVisit(req);
  res.json({
    settings: db.settings
  });
});

// GET Direct Source Code ZIP download (generated on demand in /tmp to keep workspace text-only)
app.get('/api/download-zip', (req: Request, res: Response) => {
  try {
    const zipPath = path.join(os.tmpdir(), 'ShopDirect-App-SourceCode.zip');
    const pyScript = `
import os, zipfile
zip_path = ${JSON.stringify(zipPath)}
root_dir = ${JSON.stringify(__dirname)}
exclude_dirs = {"node_modules", ".git", "dist", ".aistudio", "android"}
exclude_files = {".DS_Store", "bun.lock"}
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
    for root, dirs, files in os.walk(root_dir):
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        for f in files:
            if f in exclude_files or f.endswith(".zip"):
                continue
            fp = os.path.join(root, f)
            zipf.write(fp, os.path.relpath(fp, root_dir))
`;
    execFileSync('python3', ['-c', pyScript]);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="ShopDirect-App-SourceCode.zip"');
    res.download(zipPath, 'ShopDirect-App-SourceCode.zip');
  } catch (err) {
    console.error('Error generating source zip:', err);
    res.status(500).send('Failed to generate ZIP archive.');
  }
});

// GET Categories
app.get('/api/categories', (req: Request, res: Response) => {
  const activeCategories = db.categories
    .filter(c => c.status !== 'ARCHIVED' && (req.query.all === 'true' ? true : c.status === 'ACTIVE'))
    .sort((a, b) => a.order - b.order);
  res.json({ categories: activeCategories });
});

// GET Banners
app.get('/api/banners', (req: Request, res: Response) => {
  const activeBanners = db.banners
    .filter(b => b.active)
    .sort((a, b) => a.order - b.order);
  res.json({ banners: activeBanners });
});

// GET Products with search, filtering, and sorting
app.get('/api/products', (req: Request, res: Response) => {
  const { category, search, filter, sort } = req.query;
  
  let result = db.products.filter(p => p.status !== 'ARCHIVED');

  // Customer view filters out HIDDEN
  if (req.query.includeHidden !== 'true') {
    result = result.filter(p => p.status !== 'HIDDEN');
  }

  // Category filter
  if (category && category !== 'all') {
    if (category === 'offers') {
      result = result.filter(p => p.offer || (p.originalPrice && p.originalPrice > p.price));
    } else if (category === 'popular') {
      result = result.filter(p => p.featured || p.rating >= 4.7);
    } else if (category === 'new') {
      result = result.slice().reverse();
    } else {
      result = result.filter(p => p.category === category);
    }
  }

  // Search keyword
  if (search && typeof search === 'string') {
    const q = search.toLowerCase().trim();
    result = result.filter(p => 
      p.name.toLowerCase().includes(q) || 
      p.description.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    );
  }

  // Filter in-stock only
  if (filter === 'in_stock') {
    result = result.filter(p => p.stock > 0 && p.status === 'ACTIVE');
  } else if (filter === 'offers') {
    result = result.filter(p => p.offer || (p.originalPrice && p.originalPrice > p.price));
  }

  // Sorting
  if (sort === 'price_low') {
    result.sort((a, b) => a.price - b.price);
  } else if (sort === 'price_high') {
    result.sort((a, b) => b.price - a.price);
  } else if (sort === 'popular') {
    result.sort((a, b) => (b.rating * b.reviewCount) - (a.rating * a.reviewCount));
  }

  res.json({ products: result });
});

// GET Single Product by ID
app.get('/api/products/:id', (req: Request, res: Response) => {
  const product = db.products.find(p => p.id === req.params.id);
  if (!product || product.status === 'ARCHIVED') {
    return res.status(404).json({ error: 'Product not found' });
  }

  // Fetch related products in same category
  const related = db.products
    .filter(p => p.id !== product.id && p.category === product.category && p.status === 'ACTIVE')
    .slice(0, 4);

  res.json({ product, related });
});

// GET Coupons (active list for customer view)
app.get('/api/coupons', (req: Request, res: Response) => {
  const now = new Date().toISOString();
  const activeCoupons = db.coupons.filter(c => 
    c.active && 
    c.validFrom <= now && 
    c.validTo >= now &&
    c.usedCount < c.usageLimit
  );
  res.json({ coupons: activeCoupons });
});

// ==========================================
// AUTHENTICATION & PROFILE API
// ==========================================

// POST Login (Single login endpoint for Customer AND Owner!)
app.post('/api/auth/login', (req: Request, res: Response) => {
  const { identifier, password } = req.body; // identifier can be email or phone
  if (!identifier || !password) {
    return res.status(400).json({ error: 'Please provide phone/email and password.' });
  }

  const cleanIdentifier = identifier.trim().toLowerCase();
  const user = db.users.find(u => 
    (u.email?.toLowerCase() === cleanIdentifier || u.phone === cleanIdentifier) &&
    u.passwordHash === password
  );

  if (!user) {
    return res.status(401).json({ error: 'Invalid phone/email or password.' });
  }

  const token = generateToken(user);
  const { passwordHash, ...safeUser } = user;

  res.json({
    token,
    user: safeUser
  });
});

// POST Signup (Registers normal customer)
app.post('/api/auth/signup', (req: Request, res: Response) => {
  const { name, phone, email, password } = req.body;
  if (!name || !phone || !password) {
    return res.status(400).json({ error: 'Name, phone, and password are required.' });
  }

  // Check if phone or email already registered
  const existing = db.users.find(u => u.phone === phone.trim() || (email && u.email?.toLowerCase() === email.trim().toLowerCase()));
  if (existing) {
    return res.status(409).json({ error: 'An account with this phone number or email already exists. Please login.' });
  }

  const newUser: User & { passwordHash: string } = {
    id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name: name.trim(),
    phone: phone.trim(),
    email: email?.trim(),
    passwordHash: password,
    role: 'customer', // strictly customer on public signup
    addresses: [],
    favorites: [],
    createdAt: new Date().toISOString()
  };

  db.users.push(newUser);
  saveDb();

  const token = generateToken(newUser);
  const { passwordHash: _, ...safeUser } = newUser;

  res.status(201).json({
    token,
    user: safeUser
  });
});

// GET Current User Profile
app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = db.users.find(u => u.id === req.user!.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  const { passwordHash, ...safeUser } = user;
  res.json({ user: safeUser });
});

// In-memory store for 6-digit verification codes (valid for 10 minutes)
const passwordResetOtps = new Map<string, { otp: string; expiresAt: number }>();

// POST Request 6-digit OTP for logged-in Profile changes (Phone, Email, or Password in Profile)
app.post('/api/auth/request-profile-otp', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = db.users.find(u => u.id === req.user!.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  passwordResetOtps.set(user.id, {
    otp,
    expiresAt: Date.now() + 10 * 60 * 1000
  });

  res.json({
    success: true,
    demoOtp: otp,
    message: '6-digit verification code generated for profile update.'
  });
});

// PUT Update User Profile (Name, Mobile Number, and Email ID — with OTP check when provided)
app.put('/api/auth/profile', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = db.users.find(u => u.id === req.user!.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const { name, email, phone, otp } = req.body;

  // If otp is provided, verify it
  if (otp !== undefined) {
    const record = passwordResetOtps.get(user.id);
    if (!record || Date.now() > record.expiresAt) {
      passwordResetOtps.delete(user.id);
      return res.status(400).json({ error: 'OTP code has expired or was not requested. Please request a new OTP.' });
    }
    if (record.otp !== String(otp).trim()) {
      return res.status(400).json({ error: 'Invalid 6-digit OTP code. Please check and try again.' });
    }
  }

  if (phone && String(phone).trim() !== user.phone) {
    const cleanPhone = String(phone).trim();
    const conflict = db.users.find(u => u.id !== user.id && u.phone === cleanPhone);
    if (conflict) {
      return res.status(409).json({ error: 'This mobile number is already linked to another account.' });
    }
    user.phone = cleanPhone;
  }

  if (email !== undefined) {
    const cleanEmail = String(email).trim();
    if (cleanEmail && cleanEmail.toLowerCase() !== (user.email || '').toLowerCase()) {
      const conflict = db.users.find(
        u => u.id !== user.id && u.email && u.email.toLowerCase() === cleanEmail.toLowerCase()
      );
      if (conflict) {
        return res.status(409).json({ error: 'This email address is already linked to another account.' });
      }
    }
    user.email = cleanEmail;
  }

  if (name && String(name).trim()) {
    user.name = String(name).trim();
  }

  if (otp !== undefined) {
    passwordResetOtps.delete(user.id);
  }

  saveDb();
  const { passwordHash, ...safeUser } = user;
  res.json({ user: safeUser });
});

// PUT Change Password (supports either Current Password OR 6-Digit OTP inside Profile)
app.put('/api/auth/change-password', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = db.users.find(u => u.id === req.user!.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const { currentPassword, newPassword, otp } = req.body;
  if (!newPassword) {
    return res.status(400).json({ error: 'Please provide a new password.' });
  }

  if (otp) {
    const record = passwordResetOtps.get(user.id);
    if (!record || Date.now() > record.expiresAt) {
      passwordResetOtps.delete(user.id);
      return res.status(400).json({ error: 'OTP has expired or was not requested. Please click Get OTP again.' });
    }
    if (record.otp !== String(otp).trim()) {
      return res.status(400).json({ error: 'Invalid 6-digit OTP code.' });
    }
    passwordResetOtps.delete(user.id);
  } else {
    if (!currentPassword) {
      return res.status(400).json({ error: 'Please provide your current password or verify with a 6-digit OTP.' });
    }
    if (user.passwordHash !== currentPassword) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }
  }

  if (String(newPassword).trim().length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
  }

  user.passwordHash = String(newPassword).trim();
  saveDb();

  res.json({ success: true, message: 'Password updated successfully.' });
});

// POST Forgot Password — Request 6-digit verification code (works without knowing old password)
app.post('/api/auth/forgot-password', (req: Request, res: Response) => {
  const { identifier } = req.body;
  if (!identifier || !String(identifier).trim()) {
    return res.status(400).json({ error: 'Please enter your registered mobile number or email address.' });
  }

  const cleanIdentifier = String(identifier).trim().toLowerCase();
  const user = db.users.find(
    u => u.email?.toLowerCase() === cleanIdentifier || u.phone === cleanIdentifier
  );

  if (!user) {
    return res.status(404).json({
      error: 'No account found with that mobile number or email address.'
    });
  }

  // Generate 6-digit OTP valid for 10 minutes
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  passwordResetOtps.set(user.id, {
    otp,
    expiresAt: Date.now() + 10 * 60 * 1000
  });

  res.json({
    success: true,
    demoOtp: otp,
    accountName: user.name,
    message: 'A 6-digit verification code has been generated for your account.'
  });
});

// POST Reset Password — Verify 6-digit OTP and set new password without needing old password
app.post('/api/auth/reset-password', (req: Request, res: Response) => {
  const { identifier, otp, newPassword } = req.body;
  if (!identifier || !otp || !newPassword) {
    return res.status(400).json({ error: 'Please provide your phone/email, 6-digit code, and new password.' });
  }

  const cleanIdentifier = String(identifier).trim().toLowerCase();
  const user = db.users.find(
    u => u.email?.toLowerCase() === cleanIdentifier || u.phone === cleanIdentifier
  );

  if (!user) {
    return res.status(404).json({ error: 'Account not found.' });
  }

  const record = passwordResetOtps.get(user.id);
  if (!record || Date.now() > record.expiresAt) {
    passwordResetOtps.delete(user.id);
    return res.status(400).json({ error: 'Verification code has expired or was not requested. Please request a new code.' });
  }

  if (record.otp !== String(otp).trim()) {
    return res.status(400).json({ error: 'Invalid 6-digit verification code. Please check and try again.' });
  }

  if (String(newPassword).trim().length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
  }

  user.passwordHash = String(newPassword).trim();
  passwordResetOtps.delete(user.id);
  saveDb();

  res.json({
    success: true,
    message: 'Password reset successfully! You can now sign in with your new password.'
  });
});

// POST/DELETE Favorites
app.post('/api/user/favorites', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { productId } = req.body;
  const user = db.users.find(u => u.id === req.user!.id);
  if (!user || !productId) return res.status(400).json({ error: 'Product ID required' });

  if (!user.favorites.includes(productId)) {
    user.favorites.push(productId);
    saveDb();
  }
  res.json({ favorites: user.favorites });
});

app.delete('/api/user/favorites/:productId', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = db.users.find(u => u.id === req.user!.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  user.favorites = user.favorites.filter(id => id !== req.params.productId);
  saveDb();
  res.json({ favorites: user.favorites });
});

// Address Management
app.post('/api/user/addresses', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = db.users.find(u => u.id === req.user!.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { label, recipientName, phone, addressLine, landmark, city, pincode, isDefault } = req.body;
  if (!recipientName || !phone || !addressLine || !pincode) {
    return res.status(400).json({ error: 'Missing required address fields.' });
  }

  if (isDefault) {
    user.addresses.forEach(a => { a.isDefault = false; });
  }

  const newAddress = {
    id: `addr_${Date.now()}`,
    label: label || 'Home',
    recipientName: recipientName.trim(),
    phone: phone.trim(),
    addressLine: addressLine.trim(),
    landmark: landmark?.trim() || '',
    city: city?.trim() || 'Bengaluru',
    pincode: pincode.trim(),
    isDefault: isDefault || user.addresses.length === 0
  };

  user.addresses.push(newAddress);
  saveDb();
  res.status(201).json({ addresses: user.addresses });
});

app.delete('/api/user/addresses/:addressId', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = db.users.find(u => u.id === req.user!.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  user.addresses = user.addresses.filter(a => a.id !== req.params.addressId);
  if (user.addresses.length > 0 && !user.addresses.some(a => a.isDefault)) {
    user.addresses[0].isDefault = true;
  }
  saveDb();
  res.json({ addresses: user.addresses });
});

// ==========================================
// CART & PRICING VERIFICATION
// ==========================================

// POST Server-side Cart & Pricing recalculation
app.post('/api/cart/validate', (req: Request, res: Response) => {
  const { items, couponCode, orderMethod, deliveryPincode } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.json({
      valid: false,
      error: 'Cart is empty',
      subtotal: 0,
      productDiscount: 0,
      deliveryFee: 0,
      couponDiscount: 0,
      finalTotal: 0,
      validatedItems: []
    });
  }

  let subtotal = 0;
  let productDiscount = 0;
  const validatedItems: any[] = [];
  const stockErrors: string[] = [];

  for (const item of items) {
    const product = db.products.find(p => p.id === item.productId && p.status !== 'ARCHIVED');
    if (!product) {
      stockErrors.push(`An item in your cart is no longer available.`);
      continue;
    }

    let unitPrice = product.price;
    let originalPrice = product.originalPrice || product.price;
    let variantName = '';
    let availableStock = product.stock;

    if (item.variantId && product.variants) {
      const variant = product.variants.find(v => v.id === item.variantId);
      if (variant) {
        unitPrice = variant.price;
        originalPrice = variant.originalPrice || variant.price;
        variantName = variant.name;
        availableStock = variant.stock;
      }
    }

    if (product.status === 'OUT_OF_STOCK' || availableStock <= 0) {
      stockErrors.push(`"${product.name}${variantName ? ` (${variantName})` : ''}" is currently out of stock.`);
    } else if (item.quantity > availableStock) {
      stockErrors.push(`Only ${availableStock} units of "${product.name}${variantName ? ` (${variantName})` : ''}" available.`);
    }

    const itemTotal = unitPrice * item.quantity;
    const itemOriginalTotal = originalPrice * item.quantity;
    subtotal += itemTotal;
    productDiscount += Math.max(0, itemOriginalTotal - itemTotal);

    validatedItems.push({
      productId: product.id,
      variantId: item.variantId,
      productName: product.name,
      variantName,
      price: unitPrice,
      originalPrice,
      quantity: item.quantity,
      image: product.image,
      availableStock
    });
  }

  // Delivery & Min Order calculation
  let deliveryFee = 0;
  let deliveryEligible = true;
  let deliveryMessage = '';

  if (orderMethod === 'DELIVERY') {
    if (!db.settings.deliveryEnabled) {
      deliveryEligible = false;
      deliveryMessage = 'Home delivery is currently disabled by the store.';
    } else if (deliveryPincode && !db.settings.supportedPincodes.includes(deliveryPincode.trim())) {
      deliveryEligible = false;
      deliveryMessage = `Delivery is not currently supported in pincode ${deliveryPincode}. Supported pincodes: ${db.settings.supportedPincodes.join(', ')}`;
    } else {
      if (subtotal < db.settings.minOrderAmount) {
        deliveryEligible = false;
        deliveryMessage = `Minimum order amount for delivery is ₹${db.settings.minOrderAmount}.`;
      } else if (subtotal >= db.settings.freeDeliveryThreshold) {
        deliveryFee = 0;
      } else {
        deliveryFee = db.settings.deliveryFee;
      }
    }
  }

  // Coupon validation
  let couponDiscount = 0;
  let couponMessage = '';
  let couponValid = false;

  if (couponCode && typeof couponCode === 'string') {
    const cleanCode = couponCode.trim().toUpperCase();
    const now = new Date().toISOString();
    const coupon = db.coupons.find(c => c.code === cleanCode && c.active);

    if (!coupon) {
      couponMessage = 'Invalid coupon code.';
    } else if (coupon.validFrom > now || coupon.validTo < now) {
      couponMessage = 'This coupon has expired.';
    } else if (coupon.usedCount >= coupon.usageLimit) {
      couponMessage = 'Coupon usage limit has been reached.';
    } else if (subtotal < coupon.minOrder) {
      couponMessage = `Coupon requires minimum order of ₹${coupon.minOrder}.`;
    } else {
      couponValid = true;
      if (coupon.discountType === 'PERCENTAGE') {
        const calculated = Math.round((subtotal * coupon.discountValue) / 100);
        couponDiscount = coupon.maxDiscount ? Math.min(calculated, coupon.maxDiscount) : calculated;
      } else {
        couponDiscount = Math.min(coupon.discountValue, subtotal);
      }
      couponMessage = `Coupon applied! Saved ₹${couponDiscount}.`;
    }
  }

  const finalTotal = Math.max(0, subtotal - couponDiscount + deliveryFee);

  res.json({
    valid: stockErrors.length === 0 && deliveryEligible,
    stockErrors,
    subtotal,
    productDiscount,
    couponDiscount,
    couponValid,
    couponMessage,
    deliveryFee,
    deliveryEligible,
    deliveryMessage,
    finalTotal,
    validatedItems
  });
});

// ==========================================
// ORDERS & ATOMIC STOCK MANAGEMENT
// ==========================================

// POST Place Order (with Atomic Mutex Lock for stock race condition handling)
app.post('/api/orders', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const releaseLock = await stockLock.acquire();

  try {
    const user = db.users.find(u => u.id === req.user!.id);
    if (!user) {
      return res.status(401).json({ error: 'User session invalid. Please log in.' });
    }

    // Check shop status
    if (db.settings.status === 'CLOSED' || db.settings.status === 'TEMPORARILY_NOT_ACCEPTING') {
      return res.status(400).json({ 
        error: `The store is currently ${db.settings.status === 'CLOSED' ? 'closed' : 'temporarily not accepting orders'}. Please check back later!` 
      });
    }

    const {
      items,
      orderMethod,
      deliveryAddress,
      deliveryInstructions,
      pickupTimeSlot,
      paymentMethod,
      couponCode,
      notes
    } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Order must contain at least one item.' });
    }

    if (!orderMethod || !['DELIVERY', 'PICKUP'].includes(orderMethod)) {
      return res.status(400).json({ error: 'Invalid order method.' });
    }

    if (!paymentMethod || !['UPI', 'ONLINE', 'COD', 'PAY_AT_STORE'].includes(paymentMethod)) {
      return res.status(400).json({ error: 'Invalid payment method.' });
    }

    // Verify payment method is enabled in store settings
    const methodKeyMap: Record<string, keyof ShopSettings['paymentMethods']> = {
      UPI: 'upi',
      ONLINE: 'online',
      COD: 'cod',
      PAY_AT_STORE: 'payAtStore'
    };
    if (!db.settings.paymentMethods[methodKeyMap[paymentMethod]]) {
      return res.status(400).json({ error: `${paymentMethod} is currently not accepted by this store.` });
    }

    // Validate delivery method constraints
    if (orderMethod === 'DELIVERY') {
      if (!db.settings.deliveryEnabled) {
        return res.status(400).json({ error: 'Store delivery is currently turned off.' });
      }
      if (!deliveryAddress || !deliveryAddress.pincode) {
        return res.status(400).json({ error: 'Delivery address with valid pincode is required.' });
      }
      if (!db.settings.supportedPincodes.includes(deliveryAddress.pincode.trim())) {
        return res.status(400).json({ 
          error: `Delivery to pincode ${deliveryAddress.pincode} is not supported. Supported pincodes: ${db.settings.supportedPincodes.join(', ')}` 
        });
      }
    }

    // ATOMIC STOCK VERIFICATION & SNAPSHOT CREATION
    let subtotal = 0;
    let productDiscount = 0;
    const orderItems: OrderItemSnapshot[] = [];

    for (const item of items) {
      const product = db.products.find(p => p.id === item.productId);
      if (!product || product.status === 'ARCHIVED' || product.status === 'HIDDEN') {
        return res.status(409).json({ error: `Product is no longer available in the shop catalogue.` });
      }

      let availableStock = product.stock;
      let unitPrice = product.price;
      let originalPrice = product.originalPrice || product.price;
      let variantName = '';

      if (item.variantId && product.variants) {
        const variant = product.variants.find(v => v.id === item.variantId);
        if (!variant) {
          return res.status(409).json({ error: `Selected product variant is no longer available.` });
        }
        availableStock = variant.stock;
        unitPrice = variant.price;
        originalPrice = variant.originalPrice || variant.price;
        variantName = variant.name;
      }

      // Check stock strictly against database
      if (product.status === 'OUT_OF_STOCK' || availableStock < item.quantity) {
        return res.status(409).json({ 
          error: `Insufficient stock for "${product.name}${variantName ? ` (${variantName})` : ''}". Available: ${availableStock}, Requested: ${item.quantity}.`
        });
      }

      const itemTotal = unitPrice * item.quantity;
      const itemOrigTotal = originalPrice * item.quantity;
      subtotal += itemTotal;
      productDiscount += Math.max(0, itemOrigTotal - itemTotal);

      orderItems.push({
        productId: product.id,
        variantId: item.variantId,
        productName: product.name,
        variantName,
        price: unitPrice,
        originalPrice,
        quantity: item.quantity,
        image: product.image
      });
    }

    // Minimum order check
    if (orderMethod === 'DELIVERY' && subtotal < db.settings.minOrderAmount) {
      return res.status(400).json({ 
        error: `Minimum order amount for delivery is ₹${db.settings.minOrderAmount}. Current items total: ₹${subtotal}.` 
      });
    }

    // Delivery fee
    let deliveryFee = 0;
    if (orderMethod === 'DELIVERY') {
      deliveryFee = subtotal >= db.settings.freeDeliveryThreshold ? 0 : db.settings.deliveryFee;
    }

    // Coupon calculation
    let couponDiscount = 0;
    let appliedCoupon: Coupon | undefined;

    if (couponCode) {
      const cleanCode = couponCode.trim().toUpperCase();
      const now = new Date().toISOString();
      appliedCoupon = db.coupons.find(c => c.code === cleanCode && c.active);

      if (appliedCoupon && appliedCoupon.validFrom <= now && appliedCoupon.validTo >= now && appliedCoupon.usedCount < appliedCoupon.usageLimit && subtotal >= appliedCoupon.minOrder) {
        if (appliedCoupon.discountType === 'PERCENTAGE') {
          const calc = Math.round((subtotal * appliedCoupon.discountValue) / 100);
          couponDiscount = appliedCoupon.maxDiscount ? Math.min(calc, appliedCoupon.maxDiscount) : calc;
        } else {
          couponDiscount = Math.min(appliedCoupon.discountValue, subtotal);
        }
        appliedCoupon.usedCount += 1;
      }
    }

    const finalTotal = Math.max(0, subtotal - couponDiscount + deliveryFee);

    // ATOMIC STOCK DECREMENT
    for (const item of items) {
      const product = db.products.find(p => p.id === item.productId);
      if (product) {
        if (item.variantId && product.variants) {
          const variant = product.variants.find(v => v.id === item.variantId);
          if (variant) {
            variant.stock = Math.max(0, variant.stock - item.quantity);
          }
        }
        product.stock = Math.max(0, product.stock - item.quantity);
        if (product.stock === 0) {
          product.status = 'OUT_OF_STOCK';
        }
      }
    }

    // Determine initial payment status securely
    // For COD / Pay at store: PENDING
    // For UPI / Online: if simulated in test mode, set PAID or PENDING based on intent
    const isPrepaid = paymentMethod === 'UPI' || paymentMethod === 'ONLINE';
    const paymentStatus: PaymentStatusType = req.body.paymentVerified ? 'PAID' : (isPrepaid ? 'PENDING' : 'PENDING');

    const orderId = `ord_${Date.now()}`;
    const orderNumber = `ORD-${Math.floor(1000 + Math.random() * 9000)}`;

    const newOrder: Order = {
      id: orderId,
      orderNumber,
      customerId: user.id,
      customerName: user.name,
      customerPhone: user.phone,
      customerEmail: user.email,
      items: orderItems,
      orderMethod,
      deliveryAddress: orderMethod === 'DELIVERY' ? deliveryAddress : undefined,
      deliveryInstructions,
      pickupTimeSlot,
      paymentMethod,
      paymentStatus,
      orderStatus: 'PLACED',
      subtotal,
      productDiscount,
      couponCode: appliedCoupon?.code,
      couponDiscount,
      deliveryFee,
      tax: 0,
      finalTotal,
      notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      timeline: [
        {
          stage: 'PLACED',
          timestamp: new Date().toISOString(),
          title: `Order Placed (${orderMethod === 'DELIVERY' ? 'Home Delivery' : 'Store Pickup'})`,
          note: `Payment: ${paymentMethod} (${paymentStatus})`
        }
      ]
    };

    db.orders.unshift(newOrder);

    // Create notifications for customer and store owner
    db.notifications.unshift({
      id: `notif_${Date.now()}_cust`,
      recipientId: user.id,
      title: 'Order Placed Successfully!',
      message: `Your order #${orderNumber} for ₹${finalTotal} has been placed.`,
      type: 'order',
      orderId,
      read: false,
      createdAt: new Date().toISOString()
    });

    db.notifications.unshift({
      id: `notif_${Date.now()}_admin`,
      recipientId: 'admin',
      title: `New Order: #${orderNumber}`,
      message: `${user.name} placed order #${orderNumber} for ₹${finalTotal} (${orderMethod}).`,
      type: 'order',
      orderId,
      read: false,
      createdAt: new Date().toISOString()
    });

    saveDb();

    res.status(201).json({ order: newOrder });
  } catch (err) {
    console.error('Error placing order:', err);
    res.status(500).json({ error: 'Internal server error while processing your order.' });
  } finally {
    releaseLock();
  }
});

// GET Customer's Orders
app.get('/api/orders/my-orders', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const customerOrders = db.orders.filter(o => o.customerId === req.user!.id);
  res.json({ orders: customerOrders });
});

// GET Single Order Details (Checks ownership or admin role)
app.get('/api/orders/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const order = db.orders.find(o => o.id === req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  // Security: only order owner or shop owner can view
  if (order.customerId !== req.user!.id && req.user!.role !== 'owner') {
    return res.status(403).json({ error: 'Access denied: You are not authorized to view this order.' });
  }

  res.json({ order });
});

// POST Retry Payment for existing order (does NOT create duplicate orders!)
app.post('/api/orders/:id/retry-payment', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const order = db.orders.find(o => o.id === req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  if (order.customerId !== req.user!.id && req.user!.role !== 'owner') {
    return res.status(403).json({ error: 'Access denied.' });
  }

  const { success, paymentMethod } = req.body;
  if (paymentMethod) {
    order.paymentMethod = paymentMethod;
  }

  if (success) {
    order.paymentStatus = 'PAID';
    order.timeline.push({
      stage: order.orderStatus,
      timestamp: new Date().toISOString(),
      title: 'Payment Successful',
      note: `Paid via ${order.paymentMethod}`
    });
  } else {
    order.paymentStatus = 'FAILED';
    order.timeline.push({
      stage: order.orderStatus,
      timestamp: new Date().toISOString(),
      title: 'Payment Attempt Failed',
      note: 'Transaction declined or cancelled by user'
    });
  }

  order.updatedAt = new Date().toISOString();
  saveDb();

  res.json({ order });
});

// POST Cancel Order (by Customer)
app.post('/api/orders/:id/cancel', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const order = db.orders.find(o => o.id === req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  if (order.customerId !== req.user!.id) {
    return res.status(403).json({ error: 'Access denied.' });
  }

  // Validate cancellation stage
  if (!db.settings.cancellationAllowedStages.includes(order.orderStatus as any)) {
    return res.status(400).json({ 
      error: `Cancellation is not allowed at current order stage (${order.orderStatus}). Please contact the shop directly.` 
    });
  }

  const { reason } = req.body;
  order.orderStatus = 'CANCELLED';
  order.cancellationReason = reason || 'Cancelled by customer';
  order.updatedAt = new Date().toISOString();

  // If prepaid, initiate refund workflow
  if (order.paymentStatus === 'PAID') {
    order.paymentStatus = 'REFUND_PENDING';
  }

  order.timeline.push({
    stage: 'CANCELLED',
    timestamp: new Date().toISOString(),
    title: 'Order Cancelled by Customer',
    note: reason ? `Reason: ${reason}` : undefined
  });

  // RESTORE STOCK ATOMICALLY
  for (const item of order.items) {
    const product = db.products.find(p => p.id === item.productId);
    if (product) {
      if (item.variantId && product.variants) {
        const variant = product.variants.find(v => v.id === item.variantId);
        if (variant) {
          variant.stock += item.quantity;
        }
      }
      product.stock += item.quantity;
      if (product.status === 'OUT_OF_STOCK' && product.stock > 0) {
        product.status = 'ACTIVE';
      }
    }
  }

  // Notify owner
  db.notifications.unshift({
    id: `notif_${Date.now()}_admin_cancel`,
    recipientId: 'admin',
    title: `Order Cancelled: #${order.orderNumber}`,
    message: `${order.customerName} cancelled order #${order.orderNumber}. Reason: ${order.cancellationReason}`,
    type: 'order',
    orderId: order.id,
    read: false,
    createdAt: new Date().toISOString()
  });

  saveDb();
  res.json({ order });
});

// Notifications API
app.get('/api/notifications', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const isOwner = req.user!.role === 'owner';
  const notifications = db.notifications.filter(n => 
    n.recipientId === req.user!.id || (isOwner && n.recipientId === 'admin')
  );
  res.json({ notifications });
});

app.put('/api/notifications/:id/read', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const notif = db.notifications.find(n => n.id === req.params.id);
  if (notif) {
    notif.read = true;
    saveDb();
  }
  res.json({ success: true });
});

// ==========================================
// SECURE ADMIN MANAGEMENT ENDPOINTS
// (Strictly verified on the backend!)
// ==========================================

// GET Admin Dashboard Metrics
app.get('/api/admin/metrics', requireOwner, (req: AuthenticatedRequest, res: Response) => {
  const todayStr = new Date().toISOString().split('T')[0];

  // Exclude cancelled/rejected orders from revenue calculation
  const validOrders = db.orders.filter(o => o.orderStatus !== 'CANCELLED' && o.orderStatus !== 'REJECTED');
  const todayOrdersList = db.orders.filter(o => o.createdAt.startsWith(todayStr));
  const todayValidOrders = todayOrdersList.filter(o => o.orderStatus !== 'CANCELLED' && o.orderStatus !== 'REJECTED');

  const todayRevenue = todayValidOrders.reduce((sum, o) => sum + o.finalTotal, 0);
  const pendingOrders = db.orders.filter(o => o.orderStatus === 'PLACED').length;
  const preparingOrders = db.orders.filter(o => o.orderStatus === 'PREPARING' || o.orderStatus === 'ACCEPTED').length;
  const completedOrders = db.orders.filter(o => o.orderStatus === 'COMPLETED').length;
  const cancelledOrders = db.orders.filter(o => o.orderStatus === 'CANCELLED' || o.orderStatus === 'REJECTED').length;

  const lowStockCount = db.products.filter(p => p.stock <= p.lowStockThreshold && p.status !== 'ARCHIVED').length;
  const totalCustomers = db.users.filter(u => u.role === 'customer').length;

  // 7-day sales trend
  const salesTrend: { date: string; amount: number; orders: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
    const dayOrders = validOrders.filter(o => o.createdAt.startsWith(d));
    const dayAmount = dayOrders.reduce((sum, o) => sum + o.finalTotal, 0);
    salesTrend.push({
      date: new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' }),
      amount: dayAmount,
      orders: dayOrders.length
    });
  }

  // Popular products calculation
  const productSalesMap: Record<string, { name: string; count: number; rev: number }> = {};
  for (const o of validOrders) {
    for (const item of o.items) {
      if (!productSalesMap[item.productId]) {
        productSalesMap[item.productId] = { name: item.productName, count: 0, rev: 0 };
      }
      productSalesMap[item.productId].count += item.quantity;
      productSalesMap[item.productId].rev += item.price * item.quantity;
    }
  }

  const popularProducts = Object.values(productSalesMap)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map(p => ({ name: p.name, salesCount: p.count, revenue: p.rev }));

  // Prune visitors inactive for > 5 minutes
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [k, ts] of activeVisitorTimestamps.entries()) {
    if (ts < cutoff) activeVisitorTimestamps.delete(k);
  }
  const liveVisitors = Math.max(1, activeVisitorTimestamps.size);

  const metrics: DashboardMetrics = {
    todayRevenue,
    todayOrders: todayOrdersList.length,
    pendingOrders,
    preparingOrders,
    completedOrders,
    cancelledOrders,
    lowStockCount,
    totalCustomers,
    liveVisitors,
    todayViews: todayStoreViews,
    totalViews: totalStoreViews,
    salesTrend,
    popularProducts
  };

  res.json({ metrics });
});

// GET Admin Orders (all shop orders)
app.get('/api/admin/orders', requireOwner, (req: AuthenticatedRequest, res: Response) => {
  res.json({ orders: db.orders });
});

// PUT Admin Order Status Transition
app.put('/api/admin/orders/:id/status', requireOwner, (req: AuthenticatedRequest, res: Response) => {
  const order = db.orders.find(o => o.id === req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const { status, rejectionReason, note } = req.body;
  const validTransitions: OrderStatusType[] = [
    'PLACED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'COMPLETED', 'REJECTED', 'CANCELLED'
  ];

  if (!validTransitions.includes(status)) {
    return res.status(400).json({ error: 'Invalid order status transition.' });
  }

  if (status === 'REJECTED' && !rejectionReason) {
    return res.status(400).json({ error: 'Rejection reason is mandatory.' });
  }

  order.orderStatus = status;
  if (rejectionReason) order.rejectionReason = rejectionReason;
  order.updatedAt = new Date().toISOString();

  // If rejected, restore stock atomically
  if (status === 'REJECTED') {
    for (const item of order.items) {
      const product = db.products.find(p => p.id === item.productId);
      if (product) {
        product.stock += item.quantity;
        if (item.variantId && product.variants) {
          const variant = product.variants.find(v => v.id === item.variantId);
          if (variant) variant.stock += item.quantity;
        }
      }
    }
    if (order.paymentStatus === 'PAID') {
      order.paymentStatus = 'REFUND_PENDING';
    }
  }

  // If completed and cash/pay at store was pending, mark paid
  if (status === 'COMPLETED' && order.paymentStatus === 'PENDING') {
    order.paymentStatus = 'PAID';
  }

  const stageTitles: Record<OrderStatusType, string> = {
    PLACED: 'Order Placed',
    ACCEPTED: 'Order Accepted by Store',
    PREPARING: 'Order is being Prepared & Packed',
    READY_FOR_PICKUP: 'Order is Ready for Pickup at Store',
    OUT_FOR_DELIVERY: 'Order is Out for Delivery',
    COMPLETED: order.orderMethod === 'PICKUP' ? 'Order Collected / Completed' : 'Order Delivered / Completed',
    REJECTED: 'Order Rejected by Store',
    CANCELLED: 'Order Cancelled'
  };

  order.timeline.push({
    stage: status as OrderStatusType,
    timestamp: new Date().toISOString(),
    title: stageTitles[status as OrderStatusType] || status,
    note: note || (rejectionReason ? `Reason: ${rejectionReason}` : undefined)
  });

  // Notify customer
  db.notifications.unshift({
    id: `notif_${Date.now()}_cust_${status}`,
    recipientId: order.customerId,
    title: `Order Update: #${order.orderNumber}`,
    message: stageTitles[status as OrderStatusType] || `Status updated to ${status}`,
    type: 'order',
    orderId: order.id,
    read: false,
    createdAt: new Date().toISOString()
  });

  saveDb();
  res.json({ order });
});

// Admin Refund status update
app.put('/api/admin/orders/:id/refund', requireOwner, (req: AuthenticatedRequest, res: Response) => {
  const order = db.orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const { refundStatus } = req.body;
  if (!['REFUND_PENDING', 'REFUNDED', 'REFUND_FAILED'].includes(refundStatus)) {
    return res.status(400).json({ error: 'Invalid refund status' });
  }

  order.paymentStatus = refundStatus as PaymentStatusType;
  order.updatedAt = new Date().toISOString();
  order.timeline.push({
    stage: order.orderStatus,
    timestamp: new Date().toISOString(),
    title: `Refund Status: ${refundStatus}`,
    note: req.body.note
  });

  saveDb();
  res.json({ order });
});

// POST Admin Product Creation
app.post('/api/admin/products', requireOwner, (req: AuthenticatedRequest, res: Response) => {
  const { name, category, description, price, originalPrice, stock, lowStockThreshold, variants, featured, offer, image, unit } = req.body;

  if (!name || !category || price === undefined || stock === undefined) {
    return res.status(400).json({ error: 'Product name, category, price, and stock are required.' });
  }

  const newProduct: Product = {
    id: `prod_${Date.now()}`,
    name: name.trim(),
    category,
    description: description?.trim() || '',
    image: image || '',
    price: Number(price),
    originalPrice: originalPrice ? Number(originalPrice) : undefined,
    stock: Number(stock),
    lowStockThreshold: lowStockThreshold ? Number(lowStockThreshold) : 5,
    variants: Array.isArray(variants) ? variants : [],
    featured: Boolean(featured),
    offer: Boolean(offer),
    rating: 5.0,
    reviewCount: 1,
    status: Number(stock) > 0 ? 'ACTIVE' : 'OUT_OF_STOCK',
    unit: unit || 'item'
  };

  db.products.unshift(newProduct);
  saveDb();
  res.status(201).json({ product: newProduct });
});

// PUT Admin Product Edit
app.put('/api/admin/products/:id', requireOwner, (req: AuthenticatedRequest, res: Response) => {
  const product = db.products.find(p => p.id === req.params.id);
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const { name, category, description, price, originalPrice, stock, lowStockThreshold, variants, featured, offer, status, image, unit } = req.body;

  if (name !== undefined) product.name = name.trim();
  if (category !== undefined) product.category = category;
  if (description !== undefined) product.description = description.trim();
  if (price !== undefined) product.price = Number(price);
  if (originalPrice !== undefined) product.originalPrice = originalPrice ? Number(originalPrice) : undefined;
  if (stock !== undefined) {
    product.stock = Number(stock);
    if (product.stock === 0 && product.status === 'ACTIVE') {
      product.status = 'OUT_OF_STOCK';
    } else if (product.stock > 0 && product.status === 'OUT_OF_STOCK') {
      product.status = 'ACTIVE';
    }
  }
  if (lowStockThreshold !== undefined) product.lowStockThreshold = Number(lowStockThreshold);
  if (variants !== undefined) product.variants = variants;
  if (featured !== undefined) product.featured = Boolean(featured);
  if (offer !== undefined) product.offer = Boolean(offer);
  if (status !== undefined) product.status = status;
  if (image !== undefined) product.image = image;
  if (unit !== undefined) product.unit = unit;

  saveDb();
  res.json({ product });
});

// POST Admin Stock Adjustment
app.post('/api/admin/inventory/adjust', requireOwner, (req: AuthenticatedRequest, res: Response) => {
  const { productId, variantId, newStock } = req.body;
  const product = db.products.find(p => p.id === productId);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const stockVal = Math.max(0, Number(newStock));

  if (variantId && product.variants) {
    const variant = product.variants.find(v => v.id === variantId);
    if (variant) {
      variant.stock = stockVal;
    }
  } else {
    product.stock = stockVal;
    if (stockVal === 0) product.status = 'OUT_OF_STOCK';
    else if (product.status === 'OUT_OF_STOCK' && stockVal > 0) product.status = 'ACTIVE';
  }

  saveDb();
  res.json({ product });
});

// Categories Management
app.post('/api/admin/categories', requireOwner, (req: AuthenticatedRequest, res: Response) => {
  const { name, slug, icon, color, order } = req.body;
  if (!name) return res.status(400).json({ error: 'Category name required' });

  const newCat: Category = {
    id: `cat_${Date.now()}`,
    name: name.trim(),
    slug: slug ? slug.trim().toLowerCase() : name.trim().toLowerCase().replace(/\s+/g, '-'),
    icon: icon || 'Tag',
    color: color || 'indigo',
    order: order ? Number(order) : db.categories.length + 1,
    status: 'ACTIVE'
  };

  db.categories.push(newCat);
  saveDb();
  res.status(201).json({ category: newCat });
});

app.put('/api/admin/categories/:id', requireOwner, (req: AuthenticatedRequest, res: Response) => {
  const cat = db.categories.find(c => c.id === req.params.id);
  if (!cat) return res.status(404).json({ error: 'Category not found' });

  const { name, icon, color, order, status } = req.body;
  if (name !== undefined) cat.name = name.trim();
  if (icon !== undefined) cat.icon = icon;
  if (color !== undefined) cat.color = color;
  if (order !== undefined) cat.order = Number(order);
  if (status !== undefined) cat.status = status;

  saveDb();
  res.json({ category: cat });
});

// Coupons Management
app.post('/api/admin/coupons', requireOwner, (req: AuthenticatedRequest, res: Response) => {
  const { code, title, description, discountType, discountValue, minOrder, maxDiscount, validFrom, validTo, usageLimit } = req.body;
  if (!code || !discountType || discountValue === undefined) {
    return res.status(400).json({ error: 'Code, discount type and value are required.' });
  }

  const newCoupon: Coupon = {
    id: `coup_${Date.now()}`,
    code: code.trim().toUpperCase(),
    title: title?.trim() || code.trim().toUpperCase(),
    description: description?.trim() || '',
    discountType,
    discountValue: Number(discountValue),
    minOrder: minOrder ? Number(minOrder) : 0,
    maxDiscount: maxDiscount ? Number(maxDiscount) : undefined,
    validFrom: validFrom || new Date().toISOString(),
    validTo: validTo || new Date(Date.now() + 30 * 86400000).toISOString(),
    usageLimit: usageLimit ? Number(usageLimit) : 100,
    usedCount: 0,
    active: true
  };

  db.coupons.unshift(newCoupon);
  saveDb();
  res.status(201).json({ coupon: newCoupon });
});

app.put('/api/admin/coupons/:id', requireOwner, (req: AuthenticatedRequest, res: Response) => {
  const coup = db.coupons.find(c => c.id === req.params.id);
  if (!coup) return res.status(404).json({ error: 'Coupon not found' });

  const { title, description, discountType, discountValue, minOrder, maxDiscount, active, usageLimit } = req.body;
  if (title !== undefined) coup.title = title;
  if (description !== undefined) coup.description = description;
  if (discountType !== undefined) coup.discountType = discountType;
  if (discountValue !== undefined) coup.discountValue = Number(discountValue);
  if (minOrder !== undefined) coup.minOrder = Number(minOrder);
  if (maxDiscount !== undefined) coup.maxDiscount = maxDiscount ? Number(maxDiscount) : undefined;
  if (active !== undefined) coup.active = Boolean(active);
  if (usageLimit !== undefined) coup.usageLimit = Number(usageLimit);

  saveDb();
  res.json({ coupon: coup });
});

// Banners Management
app.post('/api/admin/banners', requireOwner, (req: AuthenticatedRequest, res: Response) => {
  const { title, subtitle, badge, bgColor, textColor, accentColor, linkType, linkTarget, order } = req.body;
  if (!title) return res.status(400).json({ error: 'Banner title required' });

  const newBanner: Banner = {
    id: `ban_${Date.now()}`,
    title: title.trim(),
    subtitle: subtitle?.trim() || '',
    badge: badge?.trim(),
    bgColor: bgColor || 'from-indigo-700 to-purple-900',
    textColor: textColor || 'text-white',
    accentColor: accentColor || '#6366f1',
    linkType: linkType || 'none',
    linkTarget,
    active: true,
    order: order ? Number(order) : db.banners.length + 1
  };

  db.banners.push(newBanner);
  saveDb();
  res.status(201).json({ banner: newBanner });
});

app.put('/api/admin/banners/:id', requireOwner, (req: AuthenticatedRequest, res: Response) => {
  const banner = db.banners.find(b => b.id === req.params.id);
  if (!banner) return res.status(404).json({ error: 'Banner not found' });

  const { title, subtitle, badge, bgColor, active, linkType, linkTarget, order } = req.body;
  if (title !== undefined) banner.title = title.trim();
  if (subtitle !== undefined) banner.subtitle = subtitle.trim();
  if (badge !== undefined) banner.badge = badge.trim();
  if (bgColor !== undefined) banner.bgColor = bgColor;
  if (active !== undefined) banner.active = Boolean(active);
  if (linkType !== undefined) banner.linkType = linkType;
  if (linkTarget !== undefined) banner.linkTarget = linkTarget;
  if (order !== undefined) banner.order = Number(order);

  saveDb();
  res.json({ banner });
});

// Admin Shop Settings update
app.put('/api/admin/settings', requireOwner, (req: AuthenticatedRequest, res: Response) => {
  const updates = req.body;
  db.settings = {
    ...db.settings,
    ...updates,
    paymentMethods: {
      ...db.settings.paymentMethods,
      ...(updates.paymentMethods || {})
    }
  };

  saveDb();
  res.json({ settings: db.settings });
});

// Admin Customers List
app.get('/api/admin/customers', requireOwner, (req: AuthenticatedRequest, res: Response) => {
  const customers = db.users
    .filter(u => u.role === 'customer')
    .map(u => {
      const custOrders = db.orders.filter(o => o.customerId === u.id);
      const totalSpent = custOrders.filter(o => o.orderStatus !== 'CANCELLED' && o.orderStatus !== 'REJECTED')
        .reduce((sum, o) => sum + o.finalTotal, 0);
      return {
        id: u.id,
        name: u.name,
        phone: u.phone,
        email: u.email,
        totalOrders: custOrders.length,
        totalSpent,
        createdAt: u.createdAt,
        addressesCount: u.addresses.length
      };
    });

  res.json({ customers });
});

// Admin Update Customer Details (Name, Mobile Number, Email ID) & Optional Password Reset
app.put('/api/admin/customers/:id/reset-password', requireOwner, (req: AuthenticatedRequest, res: Response) => {
  const customer = db.users.find(u => u.id === req.params.id && u.role === 'customer');
  if (!customer) {
    return res.status(404).json({ error: 'Customer account not found.' });
  }

  const { name, phone, email, newPassword } = req.body;

  if (phone !== undefined && String(phone).trim()) {
    const cleanPhone = String(phone).trim();
    const conflict = db.users.find(u => u.id !== customer.id && u.phone === cleanPhone);
    if (conflict) {
      return res.status(409).json({ error: 'This mobile number is already used by another account.' });
    }
    customer.phone = cleanPhone;
  }

  if (email !== undefined) {
    const cleanEmail = String(email).trim();
    if (cleanEmail) {
      const conflict = db.users.find(
        u => u.id !== customer.id && u.email && u.email.toLowerCase() === cleanEmail.toLowerCase()
      );
      if (conflict) {
        return res.status(409).json({ error: 'This email address is already used by another account.' });
      }
    }
    customer.email = cleanEmail;
  }

  if (name !== undefined && String(name).trim()) {
    customer.name = String(name).trim();
  }

  if (newPassword !== undefined && String(newPassword).trim() !== '') {
    if (String(newPassword).trim().length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
    }
    customer.passwordHash = String(newPassword).trim();
  }

  saveDb();

  res.json({
    success: true,
    message: `Account details updated for ${customer.name}.`
  });
});

// ==========================================
// STATIC FILES & VITE MIDDLEWARE SETUP
// ==========================================

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    // Development mode: mount Vite dev server as middleware
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`🚀 ShopDirect Unified Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
