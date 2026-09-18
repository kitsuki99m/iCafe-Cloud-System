import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const repoRoot = path.resolve(import.meta.dirname, '..')

const targetDirs = [
  path.join(repoRoot, 'apps', 'admin', 'public', 'assets', 'menu'),
  path.join(repoRoot, 'apps', 'customer', 'public', 'assets', 'menu'),
  path.join(repoRoot, 'backend', 'public', 'assets', 'menu'),
  path.join(repoRoot, 'apps', 'admin', 'dist', 'assets', 'menu'),
  path.join(repoRoot, 'apps', 'customer', 'dist', 'assets', 'menu'),
]

for (const dir of targetDirs) {
  fs.mkdirSync(dir, { recursive: true })
}

// Categories list
export const PHILIPPINE_MENU_CATEGORIES = [
  'All',
  'Pancit Canton',
  'Cup Noodles',
  'Rice Meals & Silog',
  'Soft Drinks',
  'Yogurt & Cultured Drinks',
  'Teas & Juices',
  'Energy & Sports Drinks',
  'Milk & Dairy Drinks',
  'Powdered Drinks & Coffee',
  'Water & Cold Treats',
  'Biscuits & Crackers',
  'Biscuits & Sweets',
  'Chocolates & Candies',
  'Junk Food & Chips',
  'Potato & Multigrain Crisps',
  'Corn Chips & Nachos',
  'Puffed & Cheese Snacks',
  'Seafood Crackers & Chicharon',
  'Nuts & Seeds',
  'Budget & Piso Chichirya',
]

// Item definitions without descriptions
export const ITEMS = [
  // ==========================================
  // PANCIT CANTON & INSTANT NOODLES
  // ==========================================
  {
    id: 'lucky-me-pancit-canton-kalamansi',
    name: 'Lucky Me! Pancit Canton Kalamansi',
    category: 'Food',
    subcategory: 'Pancit Canton',
    price: 20.00,
    stockQuantity: 48,
    imageUrl: '/assets/menu/lucky-me-pancit-canton-kalamansi.webp',
    color: '#15803d',
    badgeText: 'Kalamansi',
    icon: '🍜'
  },
  {
    id: 'lucky-me-pancit-canton-chilimansi',
    name: 'Lucky Me! Pancit Canton Chilimansi',
    category: 'Food',
    subcategory: 'Pancit Canton',
    price: 20.00,
    stockQuantity: 48,
    imageUrl: '/assets/menu/lucky-me-pancit-canton-chilimansi.webp',
    color: '#65a30d',
    badgeText: 'Chilimansi',
    icon: '🌶️'
  },
  {
    id: 'lucky-me-pancit-canton-original',
    name: 'Lucky Me! Pancit Canton Original',
    category: 'Food',
    subcategory: 'Pancit Canton',
    price: 20.00,
    stockQuantity: 36,
    imageUrl: '/assets/menu/lucky-me-pancit-canton-original.webp',
    color: '#d97706',
    badgeText: 'Original',
    icon: '🥢'
  },
  {
    id: 'lucky-me-pancit-canton-hot-chili',
    name: 'Lucky Me! Pancit Canton Hot Chili',
    category: 'Food',
    subcategory: 'Pancit Canton',
    price: 20.00,
    stockQuantity: 36,
    imageUrl: '/assets/menu/lucky-me-pancit-canton-hot-chili.webp',
    color: '#dc2626',
    badgeText: 'Hot Chili',
    icon: '🔥'
  },
  {
    id: 'lucky-me-pancit-canton-sweet-spicy',
    name: 'Lucky Me! Pancit Canton Sweet & Spicy',
    category: 'Food',
    subcategory: 'Pancit Canton',
    price: 20.00,
    stockQuantity: 48,
    imageUrl: '/assets/menu/lucky-me-pancit-canton-sweet-spicy.webp',
    color: '#991b1b',
    badgeText: 'Sweet & Spicy',
    icon: '🍯'
  },
  {
    id: 'lucky-me-canton-extra-hot-chili',
    name: 'Lucky Me! Pancit Canton Extra Hot Chili',
    category: 'Food',
    subcategory: 'Pancit Canton',
    price: 22.00,
    stockQuantity: 36,
    imageUrl: '/assets/menu/lucky-me-canton-extra-hot-chili.webp',
    color: '#991b1b',
    badgeText: 'Extra Hot',
    icon: '🔥'
  },
  {
    id: 'payless-extra-big-sweet-spicy',
    name: 'Payless Pancit Canton Extra Big Sweet & Spicy',
    category: 'Food',
    subcategory: 'Pancit Canton',
    price: 25.00,
    stockQuantity: 30,
    imageUrl: '/assets/menu/payless-extra-big-sweet-spicy.webp',
    color: '#b91c1c',
    badgeText: 'Extra Big',
    icon: '🍲'
  },
  {
    id: 'payless-extra-big-chilimansi',
    name: 'Payless Pancit Canton Extra Big Chilimansi',
    category: 'Food',
    subcategory: 'Pancit Canton',
    price: 25.00,
    stockQuantity: 30,
    imageUrl: '/assets/menu/payless-extra-big-chilimansi.webp',
    color: '#4d7c0f',
    badgeText: 'Extra Big',
    icon: '🍋'
  },
  {
    id: 'payless-extra-big-original',
    name: 'Payless Pancit Canton Extra Big Original',
    category: 'Food',
    subcategory: 'Pancit Canton',
    price: 22.00,
    stockQuantity: 36,
    imageUrl: '/assets/menu/payless-extra-big-original.webp',
    color: '#d97706',
    badgeText: 'Original',
    icon: '🍜'
  },
  {
    id: 'indomie-mi-goreng-original',
    name: 'Indomie Mi Goreng Original',
    category: 'Food',
    subcategory: 'Pancit Canton',
    price: 25.00,
    stockQuantity: 36,
    imageUrl: '/assets/menu/indomie-mi-goreng-original.webp',
    color: '#ea580c',
    badgeText: 'Mi Goreng',
    icon: '🍳'
  },
  {
    id: 'indomie-mi-goreng-hot-spicy',
    name: 'Indomie Mi Goreng Hot & Spicy',
    category: 'Food',
    subcategory: 'Pancit Canton',
    price: 25.00,
    stockQuantity: 24,
    imageUrl: '/assets/menu/indomie-mi-goreng-hot-spicy.webp',
    color: '#c2410c',
    badgeText: 'Pedas',
    icon: '🌶️'
  },
  {
    id: 'nissin-yakisoba-spicy-chicken',
    name: 'Nissin Yakisoba Spicy Chicken',
    category: 'Food',
    subcategory: 'Pancit Canton',
    price: 24.00,
    stockQuantity: 36,
    imageUrl: '/assets/menu/nissin-yakisoba-spicy-chicken.webp',
    color: '#ea580c',
    badgeText: 'Spicy Chicken',
    icon: '🥢'
  },
  {
    id: 'nissin-yakisoba-savory-beef',
    name: 'Nissin Yakisoba Savory Beef',
    category: 'Food',
    subcategory: 'Pancit Canton',
    price: 24.00,
    stockQuantity: 36,
    imageUrl: '/assets/menu/nissin-yakisoba-savory-beef.webp',
    color: '#854d0e',
    badgeText: 'Savory Beef',
    icon: '🥩'
  },

  // ==========================================
  // CUP NOODLES & SOUPS
  // ==========================================
  {
    id: 'nissin-cup-noodles-beef',
    name: 'Nissin Cup Noodles Beef',
    category: 'Food',
    subcategory: 'Cup Noodles',
    price: 35.00,
    stockQuantity: 30,
    imageUrl: '/assets/menu/nissin-cup-noodles-beef.webp',
    color: '#991b1b',
    badgeText: 'Beef',
    icon: '🥩'
  },
  {
    id: 'nissin-cup-noodles-chicken',
    name: 'Nissin Cup Noodles Chicken',
    category: 'Food',
    subcategory: 'Cup Noodles',
    price: 35.00,
    stockQuantity: 30,
    imageUrl: '/assets/menu/nissin-cup-noodles-chicken.webp',
    color: '#eab308',
    badgeText: 'Chicken',
    icon: '🍗'
  },
  {
    id: 'nissin-cup-noodles-seafood',
    name: 'Nissin Cup Noodles Seafood',
    category: 'Food',
    subcategory: 'Cup Noodles',
    price: 38.00,
    stockQuantity: 36,
    imageUrl: '/assets/menu/nissin-cup-noodles-seafood.webp',
    color: '#0284c7',
    badgeText: 'Seafood',
    icon: '🦐'
  },
  {
    id: 'nissin-cup-noodles-spicy-seafood',
    name: 'Nissin Cup Noodles Spicy Seafood',
    category: 'Food',
    subcategory: 'Cup Noodles',
    price: 38.00,
    stockQuantity: 36,
    imageUrl: '/assets/menu/nissin-cup-noodles-spicy-seafood.webp',
    color: '#0369a1',
    badgeText: 'Spicy Seafood',
    icon: '🌶️'
  },
  {
    id: 'lucky-me-supreme-lapaz-batchoy',
    name: 'Lucky Me! Supreme La Paz Batchoy',
    category: 'Food',
    subcategory: 'Cup Noodles',
    price: 35.00,
    stockQuantity: 30,
    imageUrl: '/assets/menu/lucky-me-supreme-lapaz-batchoy.webp',
    color: '#ca8a04',
    badgeText: 'La Paz Batchoy',
    icon: '🍲'
  },
  {
    id: 'lucky-me-supreme-bulalo',
    name: 'Lucky Me! Supreme Bulalo',
    category: 'Food',
    subcategory: 'Cup Noodles',
    price: 35.00,
    stockQuantity: 30,
    imageUrl: '/assets/menu/lucky-me-supreme-bulalo.webp',
    color: '#78350f',
    badgeText: 'Bulalo',
    icon: '🥩'
  },
  {
    id: 'lucky-me-supreme-chicken-mami',
    name: 'Lucky Me! Supreme Chicken Mami',
    category: 'Food',
    subcategory: 'Cup Noodles',
    price: 35.00,
    stockQuantity: 24,
    imageUrl: '/assets/menu/lucky-me-supreme-chicken-mami.webp',
    color: '#d97706',
    badgeText: 'Chicken Mami',
    icon: '🍜'
  },
  {
    id: 'jin-ramen-cup-mild',
    name: 'Ottogi Jin Ramen Cup (Mild)',
    category: 'Food',
    subcategory: 'Cup Noodles',
    price: 50.00,
    stockQuantity: 24,
    imageUrl: '/assets/menu/jin-ramen-cup-mild.webp',
    color: '#2563eb',
    badgeText: 'Jin Mild',
    icon: '🍜'
  },
  {
    id: 'jin-ramen-cup-spicy',
    name: 'Ottogi Jin Ramen Cup (Spicy)',
    category: 'Food',
    subcategory: 'Cup Noodles',
    price: 50.00,
    stockQuantity: 24,
    imageUrl: '/assets/menu/jin-ramen-cup-spicy.webp',
    color: '#b91c1c',
    badgeText: 'Jin Spicy',
    icon: '🌶️'
  },
  {
    id: 'shin-ramyun-cup',
    name: 'Nongshim Shin Ramyun Cup',
    category: 'Food',
    subcategory: 'Cup Noodles',
    price: 65.00,
    stockQuantity: 24,
    imageUrl: '/assets/menu/shin-ramyun-cup.webp',
    color: '#991b1b',
    badgeText: 'Shin Ramyun',
    icon: '🔥'
  },
  {
    id: 'samyang-buldak-2x-spicy',
    name: 'Samyang Buldak 2x Spicy Hot Chicken',
    category: 'Food',
    subcategory: 'Cup Noodles',
    price: 75.00,
    stockQuantity: 18,
    imageUrl: '/assets/menu/samyang-buldak-2x-spicy.webp',
    color: '#18181b',
    badgeText: '2x Spicy',
    icon: '💀'
  },
  {
    id: 'buldak-carbonara-cup',
    name: 'Samyang Buldak Carbonara Cup Ramen',
    category: 'Food',
    subcategory: 'Cup Noodles',
    price: 85.00,
    stockQuantity: 24,
    imageUrl: '/assets/menu/buldak-carbonara-cup.webp',
    color: '#f472b6',
    badgeText: 'Carbonara',
    icon: '🧀'
  },

  // ==========================================
  // RICE MEALS & SILOG (CAFE KITCHEN)
  // ==========================================
  {
    id: 'fried-siomai-4pcs',
    name: 'Fried Pork Siomai (4 pcs with Chili Dip)',
    category: 'Food',
    subcategory: 'Rice Meals & Silog',
    price: 35.00,
    stockQuantity: 30,
    imageUrl: '/assets/menu/fried-siomai-4pcs.webp',
    color: '#ea580c',
    badgeText: 'Fried Siomai',
    icon: '🥟'
  },
  {
    id: 'hotsilog',
    name: 'Hotsilog (Hotdog, Sinangag, Fried Egg)',
    category: 'Food',
    subcategory: 'Rice Meals & Silog',
    price: 55.00,
    stockQuantity: 20,
    imageUrl: '/assets/menu/hotsilog.webp',
    color: '#dc2626',
    badgeText: 'Hotsilog',
    icon: '🌭'
  },
  {
    id: 'tapsilog',
    name: 'Tapsilog (Beef Tapa, Sinangag, Fried Egg)',
    category: 'Food',
    subcategory: 'Rice Meals & Silog',
    price: 75.00,
    stockQuantity: 20,
    imageUrl: '/assets/menu/tapsilog.webp',
    color: '#7f1d1d',
    badgeText: 'Tapsilog',
    icon: '🥩'
  },
  {
    id: 'tocilog',
    name: 'Tocilog (Pork Tocino, Sinangag, Fried Egg)',
    category: 'Food',
    subcategory: 'Rice Meals & Silog',
    price: 65.00,
    stockQuantity: 20,
    imageUrl: '/assets/menu/tocilog.webp',
    color: '#be123c',
    badgeText: 'Tocilog',
    icon: '🥓'
  },
  {
    id: 'longsilog',
    name: 'Longsilog (Pork Longganisa, Sinangag, Fried Egg)',
    category: 'Food',
    subcategory: 'Rice Meals & Silog',
    price: 65.00,
    stockQuantity: 20,
    imageUrl: '/assets/menu/longsilog.webp',
    color: '#991b1b',
    badgeText: 'Longsilog',
    icon: '🌭'
  },
  {
    id: 'cornsilog',
    name: 'Cornsilog (Corned Beef, Sinangag, Fried Egg)',
    category: 'Food',
    subcategory: 'Rice Meals & Silog',
    price: 65.00,
    stockQuantity: 20,
    imageUrl: '/assets/menu/cornsilog.webp',
    color: '#b91c1c',
    badgeText: 'Cornsilog',
    icon: '🍳'
  },
  {
    id: 'pork-sisig-rice',
    name: 'Sizzling Pork Sisig Rice Meal',
    category: 'Food',
    subcategory: 'Rice Meals & Silog',
    price: 75.00,
    stockQuantity: 20,
    imageUrl: '/assets/menu/pork-sisig-rice.webp',
    color: '#7f1d1d',
    badgeText: 'Sisig Rice',
    icon: '🍲'
  },
  {
    id: 'hard-boiled-egg',
    name: 'Hard Boiled Egg (with Salt & Pepper)',
    category: 'Food',
    subcategory: 'Rice Meals & Silog',
    price: 15.00,
    stockQuantity: 30,
    imageUrl: '/assets/menu/hard-boiled-egg.webp',
    color: '#eab308',
    badgeText: 'Boiled Egg',
    icon: '🥚'
  },

  // ==========================================
  // SOFT DRINKS (CARBONATED BEVERAGES)
  // ==========================================
  {
    id: 'coke-royal-sprite-swakto',
    name: 'Coke / Royal / Sprite Swakto (180ml–200ml)',
    category: 'Drinks',
    subcategory: 'Soft Drinks',
    price: 15.00,
    stockQuantity: 48,
    imageUrl: '/assets/menu/coke-royal-sprite-swakto.webp',
    color: '#dc2626',
    badgeText: 'Swakto PET',
    icon: '🥤'
  },
  {
    id: 'coke-royal-sprite-mismo',
    name: 'Coke / Royal / Sprite Mismo (250ml–300ml)',
    category: 'Drinks',
    subcategory: 'Soft Drinks',
    price: 20.00,
    stockQuantity: 48,
    imageUrl: '/assets/menu/coke-royal-sprite-mismo.webp',
    color: '#ea580c',
    badgeText: 'Mismo PET',
    icon: '🥤'
  },
  {
    id: 'coke-royal-sprite-8oz-rgb',
    name: 'Coke / Royal / Sprite 8oz RGB (237ml Glass Bottle)',
    category: 'Drinks',
    subcategory: 'Soft Drinks',
    price: 15.00,
    stockQuantity: 36,
    imageUrl: '/assets/menu/coke-royal-sprite-8oz-rgb.webp',
    color: '#16a34a',
    badgeText: '8oz Glass',
    icon: '🍾'
  },
  {
    id: 'coke-royal-sprite-1-5l',
    name: 'Coke / Royal / Sprite 1.5L PET Bottle',
    category: 'Drinks',
    subcategory: 'Soft Drinks',
    price: 80.00,
    stockQuantity: 20,
    imageUrl: '/assets/menu/coke-royal-sprite-1-5l.webp',
    color: '#b91c1c',
    badgeText: '1.5L Jumbo',
    icon: '🍾'
  },
  {
    id: 'pepsi-mountain-dew-7up-pet',
    name: 'Pepsi / Mountain Dew / 7Up PET (290ml–300ml)',
    category: 'Drinks',
    subcategory: 'Soft Drinks',
    price: 20.00,
    stockQuantity: 48,
    imageUrl: '/assets/menu/pepsi-mountain-dew-7up-pet.webp',
    color: '#2563eb',
    badgeText: '300ml PET',
    icon: '⚡'
  },
  {
    id: 'rc-cola-pop-cola-arcy',
    name: 'RC Cola / Pop Cola / Arcy Root Beer (240ml–300ml)',
    category: 'Drinks',
    subcategory: 'Soft Drinks',
    price: 15.00,
    stockQuantity: 48,
    imageUrl: '/assets/menu/rc-cola-pop-cola-arcy.webp',
    color: '#1d4ed8',
    badgeText: 'Budget Soda',
    icon: '🥤'
  },

  // ==========================================
  // YOGURT & PROBIOTIC CULTURED DRINKS
  // ==========================================
  {
    id: 'yakult-original-light',
    name: 'Yakult (Original / Light 80ml)',
    category: 'Drinks',
    subcategory: 'Yogurt & Cultured Drinks',
    price: 12.00,
    stockQuantity: 48,
    imageUrl: '/assets/menu/yakult-original-light.webp',
    color: '#e11d48',
    badgeText: 'Yakult 80ml',
    icon: '🥛'
  },
  {
    id: 'dutch-mill-yogurt-small',
    name: 'Dutch Mill Yogurt Drink (Small 90ml)',
    category: 'Drinks',
    subcategory: 'Yogurt & Cultured Drinks',
    price: 11.00,
    stockQuantity: 36,
    imageUrl: '/assets/menu/dutch-mill-yogurt-small.webp',
    color: '#0284c7',
    badgeText: '90ml Bottle',
    icon: '🥛'
  },
  {
    id: 'dutch-mill-yogurt-regular',
    name: 'Dutch Mill Yogurt Drink (Regular 180ml)',
    category: 'Drinks',
    subcategory: 'Yogurt & Cultured Drinks',
    price: 20.00,
    stockQuantity: 36,
    imageUrl: '/assets/menu/dutch-mill-yogurt-regular.webp',
    color: '#0369a1',
    badgeText: '180ml Bottle',
    icon: '🥛'
  },
  {
    id: 'dutch-mill-delight',
    name: 'Dutch Mill Delight (100ml)',
    category: 'Drinks',
    subcategory: 'Yogurt & Cultured Drinks',
    price: 12.00,
    stockQuantity: 36,
    imageUrl: '/assets/menu/dutch-mill-delight.webp',
    color: '#f97316',
    badgeText: 'Delight 100ml',
    icon: '🥛'
  },
  {
    id: 'chamyto-cultured-milk',
    name: 'Chamyto Cultured Milk (100ml)',
    category: 'Drinks',
    subcategory: 'Yogurt & Cultured Drinks',
    price: 11.00,
    stockQuantity: 36,
    imageUrl: '/assets/menu/chamyto-cultured-milk.webp',
    color: '#10b981',
    badgeText: 'Chamyto 100ml',
    icon: '🥛'
  },

  // ==========================================
  // READY-TO-DRINK TEAS & JUICES
  // ==========================================
  {
    id: 'c2-cool-clean-solo',
    name: 'C2 Cool & Clean Solo (230ml PET)',
    category: 'Drinks',
    subcategory: 'Teas & Juices',
    price: 15.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/c2-cool-clean-solo.webp',
    color: '#16a34a',
    badgeText: 'C2 Solo 230ml',
    icon: '🍵'
  },
  {
    id: 'c2-cool-clean-regular',
    name: 'C2 Cool & Clean Regular (355ml PET)',
    category: 'Drinks',
    subcategory: 'Teas & Juices',
    price: 22.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/c2-cool-clean-regular.webp',
    color: '#15803d',
    badgeText: 'C2 Reg 355ml',
    icon: '🍵'
  },
  {
    id: 'c2-cool-clean-large',
    name: 'C2 Cool & Clean Large (500ml PET)',
    category: 'Drinks',
    subcategory: 'Teas & Juices',
    price: 30.00,
    stockQuantity: 30,
    imageUrl: '/assets/menu/c2-cool-clean-large.webp',
    color: '#166534',
    badgeText: 'C2 Lrg 500ml',
    icon: '🍵'
  },
  {
    id: 'zesto-doypack-juice',
    name: 'Zest-O Doypack Juice Pouch (200ml)',
    category: 'Drinks',
    subcategory: 'Teas & Juices',
    price: 11.00,
    stockQuantity: 48,
    imageUrl: '/assets/menu/zesto-doypack-juice.webp',
    color: '#ea580c',
    badgeText: 'Zest-O 200ml',
    icon: '🧃'
  },
  {
    id: 'zesto-big-250-juice',
    name: 'Zest-O Big 250 Juice Pouch (250ml)',
    category: 'Drinks',
    subcategory: 'Teas & Juices',
    price: 14.00,
    stockQuantity: 48,
    imageUrl: '/assets/menu/zesto-big-250-juice.webp',
    color: '#f97316',
    badgeText: 'Big 250ml',
    icon: '🧃'
  },
  {
    id: 'refresh-plus-juice-pouch',
    name: 'Refresh / Plus! Juice Pouch (200ml)',
    category: 'Drinks',
    subcategory: 'Teas & Juices',
    price: 9.00,
    stockQuantity: 48,
    imageUrl: '/assets/menu/refresh-plus-juice-pouch.webp',
    color: '#f59e0b',
    badgeText: 'Refresh 200ml',
    icon: '🧃'
  },
  {
    id: 'smart-c-350ml',
    name: 'Smart C+ 500 (350ml PET)',
    category: 'Drinks',
    subcategory: 'Teas & Juices',
    price: 24.00,
    stockQuantity: 36,
    imageUrl: '/assets/menu/smart-c-350ml.webp',
    color: '#eab308',
    badgeText: 'Smart C 350ml',
    icon: '🍋'
  },
  {
    id: 'smart-c-500ml',
    name: 'Smart C+ 500 (500ml PET)',
    category: 'Drinks',
    subcategory: 'Teas & Juices',
    price: 38.00,
    stockQuantity: 30,
    imageUrl: '/assets/menu/smart-c-500ml.webp',
    color: '#ca8a04',
    badgeText: 'Smart C 500ml',
    icon: '🍋'
  },
  {
    id: 'mogu-mogu-nata-de-coco',
    name: 'Mogu Mogu Nata de Coco Drink (320ml PET)',
    category: 'Drinks',
    subcategory: 'Teas & Juices',
    price: 40.00,
    stockQuantity: 30,
    imageUrl: '/assets/menu/mogu-mogu-nata-de-coco.webp',
    color: '#f43f5e',
    badgeText: 'Nata de Coco',
    icon: '🧃'
  },
  {
    id: 'del-monte-pineapple-juice',
    name: 'Del Monte Pineapple Juice (220ml–240ml Can)',
    category: 'Drinks',
    subcategory: 'Teas & Juices',
    price: 32.00,
    stockQuantity: 30,
    imageUrl: '/assets/menu/del-monte-pineapple-juice.webp',
    color: '#eab308',
    badgeText: 'Pineapple Can',
    icon: '🍍'
  },

  // ==========================================
  // ENERGY & SPORTS DRINKS
  // ==========================================
  {
    id: 'cobra-energy-glass',
    name: 'Cobra Energy Drink (240ml Glass RGB)',
    category: 'Drinks',
    subcategory: 'Energy & Sports Drinks',
    price: 16.00,
    stockQuantity: 48,
    imageUrl: '/assets/menu/cobra-energy-glass.webp',
    color: '#ca8a04',
    badgeText: 'Cobra 240ml',
    icon: '⚡'
  },
  {
    id: 'cobra-energy-astig-pet',
    name: 'Cobra Energy Drink Astig PET (330ml–350ml)',
    category: 'Drinks',
    subcategory: 'Energy & Sports Drinks',
    price: 24.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/cobra-energy-astig-pet.webp',
    color: '#eab308',
    badgeText: 'Cobra PET',
    icon: '⚡'
  },
  {
    id: 'sting-energy-drink',
    name: 'Sting Energy Drink (Red / Yellow 300ml–330ml PET)',
    category: 'Drinks',
    subcategory: 'Energy & Sports Drinks',
    price: 22.00,
    stockQuantity: 48,
    imageUrl: '/assets/menu/sting-energy-drink.webp',
    color: '#e11d48',
    badgeText: 'Sting Power',
    icon: '⚡'
  },
  {
    id: 'gatorade-sports-drink-small',
    name: 'Gatorade Sports Drink (Small 350ml PET)',
    category: 'Drinks',
    subcategory: 'Energy & Sports Drinks',
    price: 38.00,
    stockQuantity: 30,
    imageUrl: '/assets/menu/gatorade-sports-drink-small.webp',
    color: '#0284c7',
    badgeText: '350ml PET',
    icon: '🏃'
  },
  {
    id: 'gatorade-sports-drink-regular',
    name: 'Gatorade Sports Drink (Regular 500ml PET)',
    category: 'Drinks',
    subcategory: 'Energy & Sports Drinks',
    price: 48.00,
    stockQuantity: 30,
    imageUrl: '/assets/menu/gatorade-sports-drink-regular.webp',
    color: '#0369a1',
    badgeText: '500ml PET',
    icon: '🏃'
  },
  {
    id: 'pocari-sweat-350ml',
    name: 'Pocari Sweat Ion Supply Drink (350ml PET)',
    category: 'Drinks',
    subcategory: 'Energy & Sports Drinks',
    price: 38.00,
    stockQuantity: 24,
    imageUrl: '/assets/menu/pocari-sweat-350ml.webp',
    color: '#0ea5e9',
    badgeText: 'Ion Supply',
    icon: '💧'
  },

  // ==========================================
  // MILK & DAIRY DRINKS
  // ==========================================
  {
    id: 'nestle-chuckie-small',
    name: 'Nestlé Chuckie (Small Baon Pack 110ml)',
    category: 'Drinks',
    subcategory: 'Milk & Dairy Drinks',
    price: 15.00,
    stockQuantity: 36,
    imageUrl: '/assets/menu/nestle-chuckie-small.webp',
    color: '#713f12',
    badgeText: 'Chuckie 110ml',
    icon: '🍫'
  },
  {
    id: 'nestle-chuckie-regular',
    name: 'Nestlé Chuckie (Regular 180ml–250ml)',
    category: 'Drinks',
    subcategory: 'Milk & Dairy Drinks',
    price: 25.00,
    stockQuantity: 36,
    imageUrl: '/assets/menu/nestle-chuckie-regular.webp',
    color: '#78350f',
    badgeText: 'Chuckie Regular',
    icon: '🍫'
  },
  {
    id: 'magnolia-chocolait',
    name: 'Magnolia Chocolait (110ml–250ml Tetra)',
    category: 'Drinks',
    subcategory: 'Milk & Dairy Drinks',
    price: 20.00,
    stockQuantity: 30,
    imageUrl: '/assets/menu/magnolia-chocolait.webp',
    color: '#854d0e',
    badgeText: 'Chocolait',
    icon: '🍫'
  },
  {
    id: 'bear-brand-sterilized-milk',
    name: 'Bear Brand Sterilized Milk (140ml–200ml Tin)',
    category: 'Drinks',
    subcategory: 'Milk & Dairy Drinks',
    price: 30.00,
    stockQuantity: 30,
    imageUrl: '/assets/menu/bear-brand-sterilized-milk.webp',
    color: '#3b82f6',
    badgeText: 'Sterilized Tin',
    icon: '🥛'
  },
  {
    id: 'vitamilk-soy-milk',
    name: 'Vitamilk Soy Milk (300ml Glass Bottle)',
    category: 'Drinks',
    subcategory: 'Milk & Dairy Drinks',
    price: 35.00,
    stockQuantity: 30,
    imageUrl: '/assets/menu/vitamilk-soy-milk.webp',
    color: '#eab308',
    badgeText: 'Soy Milk 300ml',
    icon: '🥛'
  },

  // ==========================================
  // POWDERED BEVERAGE SACHETS & COFFEE
  // ==========================================
  {
    id: 'tang-juice-sachet',
    name: 'Tang Juice Sachet (Makes 1L 20g–25g)',
    category: 'Drinks',
    subcategory: 'Powdered Drinks & Coffee',
    price: 20.00,
    stockQuantity: 50,
    imageUrl: '/assets/menu/tang-juice-sachet.webp',
    color: '#ea580c',
    badgeText: 'Tang 1L Sachet',
    icon: '🍊'
  },
  {
    id: 'eight-oclock-juice-sachet',
    name: 'Eight O\'Clock Juice Sachet (Makes 1L 20g–25g)',
    category: 'Drinks',
    subcategory: 'Powdered Drinks & Coffee',
    price: 20.00,
    stockQuantity: 50,
    imageUrl: '/assets/menu/eight-oclock-juice-sachet.webp',
    color: '#f97316',
    badgeText: '8 O\'Clock 1L',
    icon: '🍊'
  },
  {
    id: 'milo-powder-sachet',
    name: 'Milo Powder Sachet (22g–24g Single-Serve)',
    category: 'Drinks',
    subcategory: 'Powdered Drinks & Coffee',
    price: 11.00,
    stockQuantity: 60,
    imageUrl: '/assets/menu/milo-powder-sachet.webp',
    color: '#15803d',
    badgeText: 'Milo Sachet',
    icon: '🍫'
  },
  {
    id: 'bear-brand-fortified-sachet',
    name: 'Bear Brand Fortified Milk Sachet (29g–33g)',
    category: 'Drinks',
    subcategory: 'Powdered Drinks & Coffee',
    price: 15.00,
    stockQuantity: 50,
    imageUrl: '/assets/menu/bear-brand-fortified-sachet.webp',
    color: '#2563eb',
    badgeText: 'Fortified Milk',
    icon: '🥛'
  },
  {
    id: 'kopiko-nescafe-great-taste-twin-pack',
    name: 'Kopiko / Nescafé / Great Taste 3-in-1 Coffee (Twin Pack)',
    category: 'Drinks',
    subcategory: 'Powdered Drinks & Coffee',
    price: 12.00,
    stockQuantity: 60,
    imageUrl: '/assets/menu/kopiko-nescafe-great-taste-twin-pack.webp',
    color: '#713f12',
    badgeText: '3-in-1 Twin Pack',
    icon: '☕'
  },

  // ==========================================
  // WATER & HOMEMADE COLD TREATS
  // ==========================================
  {
    id: 'mineral-water-small',
    name: 'Bottled Mineral Water (Small 350ml–500ml PET)',
    category: 'Drinks',
    subcategory: 'Water & Cold Treats',
    price: 12.00,
    stockQuantity: 60,
    imageUrl: '/assets/menu/mineral-water-small.webp',
    color: '#0284c7',
    badgeText: 'Water Small',
    icon: '💧'
  },
  {
    id: 'mineral-water-large',
    name: 'Bottled Mineral Water (Large 1L PET)',
    category: 'Drinks',
    subcategory: 'Water & Cold Treats',
    price: 22.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/mineral-water-large.webp',
    color: '#0369a1',
    badgeText: 'Water 1L',
    icon: '💧'
  },
  {
    id: 'ice-water-tubig-sa-plastic',
    name: 'Ice Water ("Tubig sa Plastic" ~500ml)',
    category: 'Drinks',
    subcategory: 'Water & Cold Treats',
    price: 4.00,
    stockQuantity: 50,
    imageUrl: '/assets/menu/ice-water-tubig-sa-plastic.webp',
    color: '#38bdf8',
    badgeText: 'Tubig sa Plastic',
    icon: '🧊'
  },
  {
    id: 'ice-candy-stick',
    name: 'Ice Candy (Homemade Frozen Stick ~100ml)',
    category: 'Drinks',
    subcategory: 'Water & Cold Treats',
    price: 5.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/ice-candy-stick.webp',
    color: '#ec4899',
    badgeText: 'Ice Candy',
    icon: '🍧'
  },

  // ==========================================
  // BISCUITS & CRACKERS
  // ==========================================
  {
    id: 'skyflakes-crackers-single',
    name: 'SkyFlakes Crackers (25g Single Pack)',
    category: 'Snacks',
    subcategory: 'Biscuits & Crackers',
    price: 8.00,
    stockQuantity: 60,
    imageUrl: '/assets/menu/skyflakes-crackers-single.webp',
    color: '#1d4ed8',
    badgeText: 'SkyFlakes 25g',
    icon: '🍘'
  },
  {
    id: 'fita-crackers-single',
    name: 'Fita Crackers (30g Single Pack)',
    category: 'Snacks',
    subcategory: 'Biscuits & Crackers',
    price: 8.00,
    stockQuantity: 48,
    imageUrl: '/assets/menu/fita-crackers-single.webp',
    color: '#dc2626',
    badgeText: 'Fita 30g',
    icon: '🧈'
  },
  {
    id: 'magic-flakes-single',
    name: 'Magic Flakes (28g Single Pack)',
    category: 'Snacks',
    subcategory: 'Biscuits & Crackers',
    price: 8.00,
    stockQuantity: 48,
    imageUrl: '/assets/menu/magic-flakes-single.webp',
    color: '#2563eb',
    badgeText: 'Magic Flakes',
    icon: '🍘'
  },
  {
    id: 'rebisco-crackers-single',
    name: 'Rebisco Crackers (32g Single Pack)',
    category: 'Snacks',
    subcategory: 'Biscuits & Crackers',
    price: 8.00,
    stockQuantity: 48,
    imageUrl: '/assets/menu/rebisco-crackers-single.webp',
    color: '#b91c1c',
    badgeText: 'Rebisco 32g',
    icon: '🍘'
  },
  {
    id: 'rebisco-sandwich-single',
    name: 'Rebisco Sandwich (32g Single Pack)',
    category: 'Snacks',
    subcategory: 'Biscuits & Crackers',
    price: 9.00,
    stockQuantity: 48,
    imageUrl: '/assets/menu/rebisco-sandwich-single.webp',
    color: '#713f12',
    badgeText: 'Sandwich 32g',
    icon: '🍫'
  },
  {
    id: 'hansel-sandwich-single',
    name: 'Hansel Sandwich (31g Single Pack)',
    category: 'Snacks',
    subcategory: 'Biscuits & Crackers',
    price: 9.00,
    stockQuantity: 48,
    imageUrl: '/assets/menu/hansel-sandwich-single.webp',
    color: '#78350f',
    badgeText: 'Hansel Mocha',
    icon: '☕'
  },
  {
    id: 'hansel-plain-crackers-single',
    name: 'Hansel Plain Crackers (25g Single Pack)',
    category: 'Snacks',
    subcategory: 'Biscuits & Crackers',
    price: 8.00,
    stockQuantity: 48,
    imageUrl: '/assets/menu/hansel-plain-crackers-single.webp',
    color: '#d97706',
    badgeText: 'Hansel Plain',
    icon: '🍘'
  },
  {
    id: 'cream-o-cookies-single',
    name: 'Cream-O Cookies (30g–33g Single Pack)',
    category: 'Snacks',
    subcategory: 'Biscuits & Crackers',
    price: 10.00,
    stockQuantity: 48,
    imageUrl: '/assets/menu/cream-o-cookies-single.webp',
    color: '#1c1917',
    badgeText: 'Cream-O 30g',
    icon: '🍪'
  },
  {
    id: 'presto-creams-single',
    name: 'Presto Creams (30g Single Pack)',
    category: 'Snacks',
    subcategory: 'Biscuits & Crackers',
    price: 9.00,
    stockQuantity: 48,
    imageUrl: '/assets/menu/presto-creams-single.webp',
    color: '#92400e',
    badgeText: 'Presto Creams',
    icon: '🥜'
  },
  {
    id: 'magic-creams-single',
    name: 'Magic Creams (28g Single Pack)',
    category: 'Snacks',
    subcategory: 'Biscuits & Crackers',
    price: 9.00,
    stockQuantity: 48,
    imageUrl: '/assets/menu/magic-creams-single.webp',
    color: '#0284c7',
    badgeText: 'Magic Creams',
    icon: '🍪'
  },
  {
    id: 'frootees-biscuits-single',
    name: 'Frootees Biscuits (30g Single Pack)',
    category: 'Snacks',
    subcategory: 'Biscuits & Crackers',
    price: 9.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/frootees-biscuits-single.webp',
    color: '#ec4899',
    badgeText: 'Frootees',
    icon: '🍓'
  },
  {
    id: 'combi-triple-choco-single',
    name: 'Combi Triple Choco (30g Single Pack)',
    category: 'Snacks',
    subcategory: 'Biscuits & Crackers',
    price: 9.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/combi-triple-choco-single.webp',
    color: '#451a03',
    badgeText: 'Combi Choco',
    icon: '🍫'
  },
  {
    id: 'bravo-biscuits-single',
    name: 'Bravo Biscuits (30g Single Pack)',
    category: 'Snacks',
    subcategory: 'Biscuits & Crackers',
    price: 9.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/bravo-biscuits-single.webp',
    color: '#b45309',
    badgeText: 'Bravo 30g',
    icon: '🍘'
  },
  {
    id: 'choco-topps-single',
    name: 'Choco Topps (30g Single Pack)',
    category: 'Snacks',
    subcategory: 'Biscuits & Crackers',
    price: 9.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/choco-topps-single.webp',
    color: '#713f12',
    badgeText: 'Choco Topps',
    icon: '🍫'
  },
  {
    id: 'nissin-butter-coconut-single',
    name: 'Nissin Butter Coconut (14g–28g Single Pack)',
    category: 'Snacks',
    subcategory: 'Biscuits & Crackers',
    price: 8.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/nissin-butter-coconut-single.webp',
    color: '#ca8a04',
    badgeText: 'Butter Coconut',
    icon: '🥥'
  },
  {
    id: 'nissin-egg-nog-cookies-single',
    name: 'Nissin Egg Nog Cookies (18g–20g Single Pack)',
    category: 'Snacks',
    subcategory: 'Biscuits & Crackers',
    price: 8.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/nissin-egg-nog-cookies-single.webp',
    color: '#eab308',
    badgeText: 'Egg Nog',
    icon: '🍪'
  },
  {
    id: 'fibisco-marie-single',
    name: 'Fibisco Marie (25g Single Pack)',
    category: 'Snacks',
    subcategory: 'Biscuits & Crackers',
    price: 8.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/fibisco-marie-single.webp',
    color: '#dc2626',
    badgeText: 'Marie 25g',
    icon: '🍘'
  },
  {
    id: 'croley-buttercream-single',
    name: 'Croley Foods ButterCream Crackers (25g Single Pack)',
    category: 'Snacks',
    subcategory: 'Biscuits & Crackers',
    price: 8.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/croley-buttercream-single.webp',
    color: '#d97706',
    badgeText: 'ButterCream',
    icon: '🧈'
  },
  {
    id: 'sunflower-crackers-single',
    name: 'Sunflower Crackers (28g Single Pack)',
    category: 'Snacks',
    subcategory: 'Biscuits & Crackers',
    price: 9.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/sunflower-crackers-single.webp',
    color: '#f59e0b',
    badgeText: 'Sunflower',
    icon: '🌻'
  },
  {
    id: 'richeese-richoco-wafers-solo',
    name: 'Richeese & Richoco Wafers (38g–50g Solo Pack)',
    category: 'Snacks',
    subcategory: 'Biscuits & Crackers',
    price: 11.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/richeese-richoco-wafers-solo.webp',
    color: '#ea580c',
    badgeText: 'Richeese Wafer',
    icon: '🧀'
  },
  {
    id: 'nissin-wafers-solo',
    name: 'Nissin Wafers (12g–20g Solo Pack)',
    category: 'Snacks',
    subcategory: 'Biscuits & Crackers',
    price: 8.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/nissin-wafers-solo.webp',
    color: '#dc2626',
    badgeText: 'Nissin Wafer',
    icon: '🍫'
  },
  {
    id: 'cal-cheese-wafers-solo',
    name: 'Cal Cheese Wafers (20g–35g Solo Pack)',
    category: 'Snacks',
    subcategory: 'Biscuits & Crackers',
    price: 10.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/cal-cheese-wafers-solo.webp',
    color: '#f59e0b',
    badgeText: 'Cal Cheese',
    icon: '🧀'
  },
  {
    id: 'oishi-bread-pan-small',
    name: 'Oishi Bread Pan (24g–30g Small Pack)',
    category: 'Snacks',
    subcategory: 'Biscuits & Crackers',
    price: 9.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/oishi-bread-pan-small.webp',
    color: '#15803d',
    badgeText: 'Bread Pan',
    icon: '🥖'
  },
  {
    id: 'fudgee-barr-quake-overload',
    name: 'Fudgee Barr / Quake Overload (30g–38g Cake Bar)',
    category: 'Snacks',
    subcategory: 'Biscuits & Crackers',
    price: 11.00,
    stockQuantity: 48,
    imageUrl: '/assets/menu/fudgee-barr-quake-overload.webp',
    color: '#451a03',
    badgeText: 'Fudgee Barr',
    icon: '🍰'
  },

  // ==========================================
  // CHOCOLATES & CANDY BARS
  // ==========================================
  {
    id: 'ricoa-flat-tops-pc',
    name: 'Ricoa Flat Tops (5g Piece)',
    category: 'Snacks',
    subcategory: 'Chocolates & Candies',
    price: 3.00,
    stockQuantity: 100,
    imageUrl: '/assets/menu/ricoa-flat-tops-pc.webp',
    color: '#991b1b',
    badgeText: 'Flat Tops',
    icon: '🍬'
  },
  {
    id: 'ricoa-curly-tops-pc',
    name: 'Ricoa Curly Tops (5g Piece)',
    category: 'Snacks',
    subcategory: 'Chocolates & Candies',
    price: 3.00,
    stockQuantity: 100,
    imageUrl: '/assets/menu/ricoa-curly-tops-pc.webp',
    color: '#7f1d1d',
    badgeText: 'Curly Tops',
    icon: '🍬'
  },
  {
    id: 'chocnut-pc',
    name: 'Chocnut (8g–10g Piece)',
    category: 'Snacks',
    subcategory: 'Chocolates & Candies',
    price: 3.00,
    stockQuantity: 100,
    imageUrl: '/assets/menu/chocnut-pc.webp',
    color: '#b45309',
    badgeText: 'Chocnut',
    icon: '🥜'
  },
  {
    id: 'hany-bar-pc',
    name: 'Hany Bar (8g–10g Piece)',
    category: 'Snacks',
    subcategory: 'Chocolates & Candies',
    price: 3.00,
    stockQuantity: 100,
    imageUrl: '/assets/menu/hany-bar-pc.webp',
    color: '#ca8a04',
    badgeText: 'Hany Bar',
    icon: '🥜'
  },
  {
    id: 'lala-fish-chocolate-bar',
    name: 'Lala Fish Chocolate (15g Bar)',
    category: 'Snacks',
    subcategory: 'Chocolates & Candies',
    price: 6.00,
    stockQuantity: 60,
    imageUrl: '/assets/menu/lala-fish-chocolate-bar.webp',
    color: '#dc2626',
    badgeText: 'Lala Choco',
    icon: '🐟'
  },
  {
    id: 'choco-mani-bar',
    name: 'Choco Mani (10g–15g Bar)',
    category: 'Snacks',
    subcategory: 'Chocolates & Candies',
    price: 4.00,
    stockQuantity: 60,
    imageUrl: '/assets/menu/choco-mani-bar.webp',
    color: '#78350f',
    badgeText: 'Choco Mani',
    icon: '🥜'
  },
  {
    id: 'goya-mayfair-chocolate-coins',
    name: 'Goya / Mayfair Chocolate Coins (3g–5g Piece)',
    category: 'Snacks',
    subcategory: 'Chocolates & Candies',
    price: 2.00,
    stockQuantity: 100,
    imageUrl: '/assets/menu/goya-mayfair-chocolate-coins.webp',
    color: '#eab308',
    badgeText: 'Choco Coins',
    icon: '🪙'
  },
  {
    id: 'cloud-9-classic-solo',
    name: 'Cloud 9 Classic (28g Solo Bar)',
    category: 'Snacks',
    subcategory: 'Chocolates & Candies',
    price: 11.00,
    stockQuantity: 48,
    imageUrl: '/assets/menu/cloud-9-classic-solo.webp',
    color: '#0284c7',
    badgeText: 'Cloud 9 28g',
    icon: '🍫'
  },
  {
    id: 'choco-mucho-solo-bar',
    name: 'Choco Mucho (30g–33g Solo Bar)',
    category: 'Snacks',
    subcategory: 'Chocolates & Candies',
    price: 11.00,
    stockQuantity: 48,
    imageUrl: '/assets/menu/choco-mucho-solo-bar.webp',
    color: '#713f12',
    badgeText: 'Choco Mucho',
    icon: '🍫'
  },
  {
    id: 'beng-beng-wafer-bar',
    name: 'Beng-Beng Wafer Bar (22g–26.5g Bar)',
    category: 'Snacks',
    subcategory: 'Chocolates & Candies',
    price: 10.00,
    stockQuantity: 48,
    imageUrl: '/assets/menu/beng-beng-wafer-bar.webp',
    color: '#ea580c',
    badgeText: 'Beng-Beng',
    icon: '🍫'
  },
  {
    id: 'safari-bar',
    name: 'Safari Bar (28g Bar)',
    category: 'Snacks',
    subcategory: 'Chocolates & Candies',
    price: 11.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/safari-bar.webp',
    color: '#ca8a04',
    badgeText: 'Safari 28g',
    icon: '🍫'
  },
  {
    id: 'tofiluk-bar',
    name: 'Tofiluk Bar (30g Bar)',
    category: 'Snacks',
    subcategory: 'Chocolates & Candies',
    price: 11.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/tofiluk-bar.webp',
    color: '#b45309',
    badgeText: 'Tofiluk 30g',
    icon: '🍫'
  },
  {
    id: 'hello-coated-chocolate-bar',
    name: 'Hello! Coated Chocolate (15g–20g Bar)',
    category: 'Snacks',
    subcategory: 'Chocolates & Candies',
    price: 7.00,
    stockQuantity: 48,
    imageUrl: '/assets/menu/hello-coated-chocolate-bar.webp',
    color: '#dc2626',
    badgeText: 'Hello! Choco',
    icon: '🍫'
  },
  {
    id: 'big-bang-bar',
    name: 'Big Bang Bar (30g Bar)',
    category: 'Snacks',
    subcategory: 'Chocolates & Candies',
    price: 11.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/big-bang-bar.webp',
    color: '#991b1b',
    badgeText: 'Big Bang',
    icon: '🍫'
  },
  {
    id: 'nips-chocolate-peanut-pouch',
    name: 'Nips Milk Chocolate / Peanut (14g–21g Pouch)',
    category: 'Snacks',
    subcategory: 'Chocolates & Candies',
    price: 9.00,
    stockQuantity: 48,
    imageUrl: '/assets/menu/nips-chocolate-peanut-pouch.webp',
    color: '#7c3aed',
    badgeText: 'Nips Pouch',
    icon: '🍬'
  },
  {
    id: 'tiwi-chocolates-pack',
    name: 'Tiwi Chocolates (10g–15g Pack)',
    category: 'Snacks',
    subcategory: 'Chocolates & Candies',
    price: 6.00,
    stockQuantity: 48,
    imageUrl: '/assets/menu/tiwi-chocolates-pack.webp',
    color: '#f59e0b',
    badgeText: 'Tiwi Choco',
    icon: '🍫'
  },
  {
    id: 'choko-choko-tube',
    name: 'Choko Choko (10g Squeeze Tube)',
    category: 'Snacks',
    subcategory: 'Chocolates & Candies',
    price: 3.00,
    stockQuantity: 100,
    imageUrl: '/assets/menu/choko-choko-tube.webp',
    color: '#713f12',
    badgeText: 'Choko Tube',
    icon: '🍫'
  },
  {
    id: 'goya-solo-bar',
    name: 'Goya Solo Bar (15g–30g Bar)',
    category: 'Snacks',
    subcategory: 'Chocolates & Candies',
    price: 12.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/goya-solo-bar.webp',
    color: '#854d0e',
    badgeText: 'Goya Solo',
    icon: '🍫'
  },
  {
    id: 'kitkat-2-finger-bar',
    name: 'KitKat (17g 2-Finger Bar)',
    category: 'Snacks',
    subcategory: 'Chocolates & Candies',
    price: 20.00,
    stockQuantity: 36,
    imageUrl: '/assets/menu/kitkat-2-finger-bar.webp',
    color: '#dc2626',
    badgeText: 'KitKat 2F',
    icon: '🍫'
  },
  {
    id: 'snickers-fun-size',
    name: 'Snickers (20g Fun Size)',
    category: 'Snacks',
    subcategory: 'Chocolates & Candies',
    price: 20.00,
    stockQuantity: 36,
    imageUrl: '/assets/menu/snickers-fun-size.webp',
    color: '#78350f',
    badgeText: 'Snickers',
    icon: '🍫'
  },
  {
    id: 'cadbury-dairy-milk-solo',
    name: 'Cadbury Dairy Milk (15g–30g Solo Bar)',
    category: 'Snacks',
    subcategory: 'Chocolates & Candies',
    price: 22.00,
    stockQuantity: 36,
    imageUrl: '/assets/menu/cadbury-dairy-milk-solo.webp',
    color: '#4338ca',
    badgeText: 'Cadbury',
    icon: '🍫'
  },
  {
    id: 'toblerone-mini-bar',
    name: 'Toblerone (35g–50g Mini Bar)',
    category: 'Snacks',
    subcategory: 'Chocolates & Candies',
    price: 40.00,
    stockQuantity: 30,
    imageUrl: '/assets/menu/toblerone-mini-bar.webp',
    color: '#ca8a04',
    badgeText: 'Toblerone',
    icon: '🍫'
  },

  // ==========================================
  // POTATO & MULTIGRAIN CRISPS
  // ==========================================
  {
    id: 'piattos-solo-pack',
    name: 'Piattos (Cheese, Sour Cream, BBQ, Roast Beef 38g–40g)',
    category: 'Snacks',
    subcategory: 'Potato & Multigrain Crisps',
    price: 19.00,
    stockQuantity: 48,
    imageUrl: '/assets/menu/piattos-solo-pack.webp',
    color: '#d97706',
    badgeText: 'Piattos Solo',
    icon: '🥔'
  },
  {
    id: 'piattos-big-pack',
    name: 'Piattos Medium / Big Pack (85g)',
    category: 'Snacks',
    subcategory: 'Potato & Multigrain Crisps',
    price: 38.00,
    stockQuantity: 30,
    imageUrl: '/assets/menu/piattos-big-pack.webp',
    color: '#b45309',
    badgeText: 'Piattos 85g',
    icon: '🥔'
  },
  {
    id: 'nova-multigrain-solo',
    name: 'Nova Multigrain Chips (Country Cheddar, BBQ 38g–40g)',
    category: 'Snacks',
    subcategory: 'Potato & Multigrain Crisps',
    price: 19.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/nova-multigrain-solo.webp',
    color: '#ca8a04',
    badgeText: 'Nova Solo',
    icon: '🌾'
  },
  {
    id: 'nova-multigrain-big-pack',
    name: 'Nova Multigrain Chips Big Pack (78g)',
    category: 'Snacks',
    subcategory: 'Potato & Multigrain Crisps',
    price: 38.00,
    stockQuantity: 30,
    imageUrl: '/assets/menu/nova-multigrain-big-pack.webp',
    color: '#a16207',
    badgeText: 'Nova 78g',
    icon: '🌾'
  },
  {
    id: 'vcut-potato-chips-solo',
    name: 'Vcut Potato Chips (Spicy BBQ, Cheese 25g)',
    category: 'Snacks',
    subcategory: 'Potato & Multigrain Crisps',
    price: 10.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/vcut-potato-chips-solo.webp',
    color: '#eab308',
    badgeText: 'Vcut 25g',
    icon: '🥔'
  },
  {
    id: 'vcut-potato-chips-big-pack',
    name: 'Vcut Potato Chips Big Pack (60g)',
    category: 'Snacks',
    subcategory: 'Potato & Multigrain Crisps',
    price: 38.00,
    stockQuantity: 30,
    imageUrl: '/assets/menu/vcut-potato-chips-big-pack.webp',
    color: '#ca8a04',
    badgeText: 'Vcut 60g',
    icon: '🥔'
  },
  {
    id: 'jack-n-jill-potato-chips-classic-25g',
    name: 'Jack \'n Jill Potato Chips Classic (25g)',
    category: 'Snacks',
    subcategory: 'Potato & Multigrain Crisps',
    price: 11.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/jack-n-jill-potato-chips-classic-25g.webp',
    color: '#dc2626',
    badgeText: 'Classic 25g',
    icon: '🥔'
  },
  {
    id: 'jack-n-jill-potato-chips-classic-60g',
    name: 'Jack \'n Jill Potato Chips Classic (60g)',
    category: 'Snacks',
    subcategory: 'Potato & Multigrain Crisps',
    price: 38.00,
    stockQuantity: 30,
    imageUrl: '/assets/menu/jack-n-jill-potato-chips-classic-60g.webp',
    color: '#b91c1c',
    badgeText: 'Classic 60g',
    icon: '🥔'
  },
  {
    id: 'oishi-natural-potato-chips-solo',
    name: 'Oishi Natural Potato Chips / Ridges (22g–24g Solo Pack)',
    category: 'Snacks',
    subcategory: 'Potato & Multigrain Crisps',
    price: 10.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/oishi-natural-potato-chips-solo.webp',
    color: '#15803d',
    badgeText: 'Oishi Ridges',
    icon: '🥔'
  },
  {
    id: 'pringles-small-can-42g',
    name: 'Pringles Potato Crisps (Small Can 42g)',
    category: 'Snacks',
    subcategory: 'Potato & Multigrain Crisps',
    price: 48.00,
    stockQuantity: 30,
    imageUrl: '/assets/menu/pringles-small-can-42g.webp',
    color: '#dc2626',
    badgeText: 'Pringles 42g',
    icon: '🥔'
  },

  // ==========================================
  // CORN CHIPS, NACHOS & CURLS
  // ==========================================
  {
    id: 'chippy-solo-pack',
    name: 'Chippy (Barbecue, Garlic & Vinegar, Chili & Cheese 27g)',
    category: 'Snacks',
    subcategory: 'Corn Chips & Nachos',
    price: 9.00,
    stockQuantity: 48,
    imageUrl: '/assets/menu/chippy-solo-pack.webp',
    color: '#b91c1c',
    badgeText: 'Chippy 27g',
    icon: '🌽'
  },
  {
    id: 'chippy-big-pack',
    name: 'Chippy Big Pack (110g)',
    category: 'Snacks',
    subcategory: 'Corn Chips & Nachos',
    price: 34.00,
    stockQuantity: 30,
    imageUrl: '/assets/menu/chippy-big-pack.webp',
    color: '#991b1b',
    badgeText: 'Chippy 110g',
    icon: '🌽'
  },
  {
    id: 'mr-chips-nacho-cheese-solo',
    name: 'Mr. Chips Nacho Cheese (24g–26g Solo Pack)',
    category: 'Snacks',
    subcategory: 'Corn Chips & Nachos',
    price: 9.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/mr-chips-nacho-cheese-solo.webp',
    color: '#d97706',
    badgeText: 'Mr. Chips Solo',
    icon: '🧀'
  },
  {
    id: 'mr-chips-nacho-cheese-big-pack',
    name: 'Mr. Chips Nacho Cheese Big Pack (98g)',
    category: 'Snacks',
    subcategory: 'Corn Chips & Nachos',
    price: 30.00,
    stockQuantity: 30,
    imageUrl: '/assets/menu/mr-chips-nacho-cheese-big-pack.webp',
    color: '#b45309',
    badgeText: 'Mr. Chips 98g',
    icon: '🧀'
  },
  {
    id: 'clover-chips-solo-pack',
    name: 'Clover Chips (Cheese, BBQ, Ham & Cheese 26g–35g)',
    category: 'Snacks',
    subcategory: 'Corn Chips & Nachos',
    price: 10.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/clover-chips-solo-pack.webp',
    color: '#f59e0b',
    badgeText: 'Clover Solo',
    icon: '🍀'
  },
  {
    id: 'clover-chips-big-pack',
    name: 'Clover Chips Big Pack (55g–85g)',
    category: 'Snacks',
    subcategory: 'Corn Chips & Nachos',
    price: 32.00,
    stockQuantity: 30,
    imageUrl: '/assets/menu/clover-chips-big-pack.webp',
    color: '#d97706',
    badgeText: 'Clover Big',
    icon: '🍀'
  },
  {
    id: 'tortillos-solo-pack',
    name: 'Tortillos (Cheese, BBQ, Chili Garlic 40g)',
    category: 'Snacks',
    subcategory: 'Corn Chips & Nachos',
    price: 17.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/tortillos-solo-pack.webp',
    color: '#ea580c',
    badgeText: 'Tortillos 40g',
    icon: '🌽'
  },
  {
    id: 'tortillos-big-pack',
    name: 'Tortillos Big Pack (80g)',
    category: 'Snacks',
    subcategory: 'Corn Chips & Nachos',
    price: 34.00,
    stockQuantity: 30,
    imageUrl: '/assets/menu/tortillos-big-pack.webp',
    color: '#c2410c',
    badgeText: 'Tortillos 80g',
    icon: '🌽'
  },
  {
    id: 'roller-coaster-rings-solo',
    name: 'Roller Coaster Potato Rings (24g Solo Pack)',
    category: 'Snacks',
    subcategory: 'Corn Chips & Nachos',
    price: 9.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/roller-coaster-rings-solo.webp',
    color: '#ca8a04',
    badgeText: 'Roller 24g',
    icon: '💍'
  },
  {
    id: 'roller-coaster-rings-big',
    name: 'Roller Coaster Potato Rings Big Pack (85g)',
    category: 'Snacks',
    subcategory: 'Corn Chips & Nachos',
    price: 34.00,
    stockQuantity: 30,
    imageUrl: '/assets/menu/roller-coaster-rings-big.webp',
    color: '#a16207',
    badgeText: 'Roller 85g',
    icon: '💍'
  },
  {
    id: 'kornets-corn-cones-solo',
    name: 'Kornets Corn Cone Snacks (25g Solo Pack)',
    category: 'Snacks',
    subcategory: 'Corn Chips & Nachos',
    price: 10.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/kornets-corn-cones-solo.webp',
    color: '#eab308',
    badgeText: 'Kornets 25g',
    icon: '🌽'
  },

  // ==========================================
  // PUFFED CORN, CHEESE SNACKS & SWEET PUFFS
  // ==========================================
  {
    id: 'cheezy-cheese-crunch-solo',
    name: 'Cheezy Cheese Crunch (24g Solo Pack)',
    category: 'Snacks',
    subcategory: 'Puffed & Cheese Snacks',
    price: 9.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/cheezy-cheese-crunch-solo.webp',
    color: '#d97706',
    badgeText: 'Cheezy 24g',
    icon: '🧀'
  },
  {
    id: 'cheezy-cheese-crunch-big',
    name: 'Cheezy Cheese Crunch Big Pack (70g)',
    category: 'Snacks',
    subcategory: 'Puffed & Cheese Snacks',
    price: 34.00,
    stockQuantity: 30,
    imageUrl: '/assets/menu/cheezy-cheese-crunch-big.webp',
    color: '#b45309',
    badgeText: 'Cheezy 70g',
    icon: '🧀'
  },
  {
    id: 'chiz-curls-solo',
    name: 'Chiz Curls (18g Solo Pack)',
    category: 'Snacks',
    subcategory: 'Puffed & Cheese Snacks',
    price: 9.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/chiz-curls-solo.webp',
    color: '#f59e0b',
    badgeText: 'Chiz Curls',
    icon: '🧀'
  },
  {
    id: 'cheese-ring-solo',
    name: 'Cheese Ring (20g Solo Pack)',
    category: 'Snacks',
    subcategory: 'Puffed & Cheese Snacks',
    price: 9.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/cheese-ring-solo.webp',
    color: '#f97316',
    badgeText: 'Cheese Ring 20g',
    icon: '💍'
  },
  {
    id: 'cheese-ring-big',
    name: 'Cheese Ring Big Pack (60g)',
    category: 'Snacks',
    subcategory: 'Puffed & Cheese Snacks',
    price: 20.00,
    stockQuantity: 30,
    imageUrl: '/assets/menu/cheese-ring-big.webp',
    color: '#ea580c',
    badgeText: 'Cheese Ring 60g',
    icon: '💍'
  },
  {
    id: 'pompoms-cheese-balls-solo',
    name: 'Pompoms Cheese Balls (18g–20g Solo Pack)',
    category: 'Snacks',
    subcategory: 'Puffed & Cheese Snacks',
    price: 7.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/pompoms-cheese-balls-solo.webp',
    color: '#eab308',
    badgeText: 'Pompoms',
    icon: '🧀'
  },
  {
    id: 'peewee-solo-pack',
    name: 'Peewee (Sizzling BBQ, Pizza 20g Solo Pack)',
    category: 'Snacks',
    subcategory: 'Puffed & Cheese Snacks',
    price: 7.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/peewee-solo-pack.webp',
    color: '#b91c1c',
    badgeText: 'Peewee 20g',
    icon: '🍕'
  },
  {
    id: 'snacku-vegetable-crackers-solo',
    name: 'Snacku Vegetable Crackers (25g Solo Pack)',
    category: 'Snacks',
    subcategory: 'Puffed & Cheese Snacks',
    price: 9.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/snacku-vegetable-crackers-solo.webp',
    color: '#15803d',
    badgeText: 'Snacku 25g',
    icon: '🥦'
  },
  {
    id: 'snacku-vegetable-crackers-big',
    name: 'Snacku Vegetable Crackers Big Pack (60g)',
    category: 'Snacks',
    subcategory: 'Puffed & Cheese Snacks',
    price: 20.00,
    stockQuantity: 30,
    imageUrl: '/assets/menu/snacku-vegetable-crackers-big.webp',
    color: '#166534',
    badgeText: 'Snacku 60g',
    icon: '🥦'
  },
  {
    id: 'tomi-super-sweet-corn-solo',
    name: 'Tomi Super Sweet Corn (23g Solo Pack)',
    category: 'Snacks',
    subcategory: 'Puffed & Cheese Snacks',
    price: 9.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/tomi-super-sweet-corn-solo.webp',
    color: '#eab308',
    badgeText: 'Tomi 23g',
    icon: '🌽'
  },
  {
    id: 'tomi-super-sweet-corn-big',
    name: 'Tomi Super Sweet Corn Big Pack (110g)',
    category: 'Snacks',
    subcategory: 'Puffed & Cheese Snacks',
    price: 30.00,
    stockQuantity: 30,
    imageUrl: '/assets/menu/tomi-super-sweet-corn-big.webp',
    color: '#ca8a04',
    badgeText: 'Tomi 110g',
    icon: '🌽'
  },
  {
    id: 'moby-solo-pack',
    name: 'Moby Caramel / Chocolate (20g Solo Pack)',
    category: 'Snacks',
    subcategory: 'Puffed & Cheese Snacks',
    price: 9.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/moby-solo-pack.webp',
    color: '#0284c7',
    badgeText: 'Moby 20g',
    icon: '🐳'
  },
  {
    id: 'moby-big-pack',
    name: 'Moby Caramel / Chocolate Big Pack (90g)',
    category: 'Snacks',
    subcategory: 'Puffed & Cheese Snacks',
    price: 28.00,
    stockQuantity: 30,
    imageUrl: '/assets/menu/moby-big-pack.webp',
    color: '#0369a1',
    badgeText: 'Moby 90g',
    icon: '🐳'
  },
  {
    id: 'oishi-pillows-solo',
    name: 'Oishi Pillows (Chocolate, Ube, Cheese 24g)',
    category: 'Snacks',
    subcategory: 'Puffed & Cheese Snacks',
    price: 10.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/oishi-pillows-solo.webp',
    color: '#713f12',
    badgeText: 'Pillows 24g',
    icon: '🍫'
  },
  {
    id: 'oishi-pillows-big',
    name: 'Oishi Pillows Big Pack (38g)',
    category: 'Snacks',
    subcategory: 'Puffed & Cheese Snacks',
    price: 17.00,
    stockQuantity: 36,
    imageUrl: '/assets/menu/oishi-pillows-big.webp',
    color: '#7e22ce',
    badgeText: 'Pillows 38g',
    icon: '🍠'
  },
  {
    id: 'sponge-crunch-solo',
    name: 'Sponge Crunch (30g Solo Pack)',
    category: 'Snacks',
    subcategory: 'Puffed & Cheese Snacks',
    price: 11.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/sponge-crunch-solo.webp',
    color: '#451a03',
    badgeText: 'Sponge 30g',
    icon: '🍫'
  },
  {
    id: 'sponge-crunch-big',
    name: 'Sponge Crunch Big Pack (120g)',
    category: 'Snacks',
    subcategory: 'Puffed & Cheese Snacks',
    price: 38.00,
    stockQuantity: 30,
    imageUrl: '/assets/menu/sponge-crunch-big.webp',
    color: '#292524',
    badgeText: 'Sponge 120g',
    icon: '🍫'
  },
  {
    id: 'oishi-onion-rings-solo',
    name: 'Oishi Onion Rings / Potato Fries (16g–24g Solo Pack)',
    category: 'Snacks',
    subcategory: 'Puffed & Cheese Snacks',
    price: 9.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/oishi-onion-rings-solo.webp',
    color: '#15803d',
    badgeText: 'Onion Rings',
    icon: '🧅'
  },

  // ==========================================
  // SEAFOOD CRACKERS & CHICHARON
  // ==========================================
  {
    id: 'oishi-prawn-crackers-solo',
    name: 'Oishi Prawn Crackers (Original, Spicy 24g Solo Pack)',
    category: 'Snacks',
    subcategory: 'Seafood Crackers & Chicharon',
    price: 9.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/oishi-prawn-crackers-solo.webp',
    color: '#ea580c',
    badgeText: 'Prawn 24g',
    icon: '🦐'
  },
  {
    id: 'oishi-cracklings-solo',
    name: 'Oishi Cracklings Salt & Vinegar (24g Solo Pack)',
    category: 'Snacks',
    subcategory: 'Seafood Crackers & Chicharon',
    price: 9.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/oishi-cracklings-solo.webp',
    color: '#dc2626',
    badgeText: 'Cracklings 24g',
    icon: '🧂'
  },
  {
    id: 'oishi-cracklings-big',
    name: 'Oishi Cracklings Salt & Vinegar Big Pack (50g)',
    category: 'Snacks',
    subcategory: 'Seafood Crackers & Chicharon',
    price: 15.00,
    stockQuantity: 36,
    imageUrl: '/assets/menu/oishi-cracklings-big.webp',
    color: '#b91c1c',
    badgeText: 'Cracklings 50g',
    icon: '🧂'
  },
  {
    id: 'oishi-kirei-yummy-flakes-solo',
    name: 'Oishi Kirei Yummy Flakes / Spicy Seafood Curls (20g–24g)',
    category: 'Snacks',
    subcategory: 'Seafood Crackers & Chicharon',
    price: 9.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/oishi-kirei-yummy-flakes-solo.webp',
    color: '#e11d48',
    badgeText: 'Kirei Flakes',
    icon: '🦐'
  },
  {
    id: 'lala-fish-crackers-solo',
    name: 'La-La Fish Crackers (20g Solo Pack)',
    category: 'Snacks',
    subcategory: 'Seafood Crackers & Chicharon',
    price: 8.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/lala-fish-crackers-solo.webp',
    color: '#0284c7',
    badgeText: 'La-La Fish',
    icon: '🐟'
  },
  {
    id: 'mang-juan-chicharron-solo',
    name: 'Chicharron ni Mang Juan (Spicy Vinegar, Garlic 25g)',
    category: 'Snacks',
    subcategory: 'Seafood Crackers & Chicharon',
    price: 10.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/mang-juan-chicharron-solo.webp',
    color: '#15803d',
    badgeText: 'Mang Juan 25g',
    icon: '🥓'
  },
  {
    id: 'mang-juan-chicken-skin-solo',
    name: 'Mang Juan Chicken Skin (25g Solo Pack)',
    category: 'Snacks',
    subcategory: 'Seafood Crackers & Chicharon',
    price: 10.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/mang-juan-chicken-skin-solo.webp',
    color: '#d97706',
    badgeText: 'Chicken Skin',
    icon: '🍗'
  },
  {
    id: 'porky-popps-solo',
    name: 'Porky Popps / Pork Rinds (20g–25g Solo Pack)',
    category: 'Snacks',
    subcategory: 'Seafood Crackers & Chicharon',
    price: 11.00,
    stockQuantity: 40,
    imageUrl: '/assets/menu/porky-popps-solo.webp',
    color: '#b91c1c',
    badgeText: 'Porky Popps',
    icon: '🥓'
  },

  // ==========================================
  // NUTS, SEEDS & PULUTAN SNACKS
  // ==========================================
  {
    id: 'boy-bawang-garlic-sachet',
    name: 'Boy Bawang Garlic Cornick (18g–21g Sachet)',
    category: 'Snacks',
    subcategory: 'Nuts & Seeds',
    price: 5.00,
    stockQuantity: 60,
    imageUrl: '/assets/menu/boy-bawang-garlic-sachet.webp',
    color: '#eab308',
    badgeText: 'Boy Bawang',
    icon: '🧄'
  },
  {
    id: 'ding-dong-mixed-nuts-solo',
    name: 'Ding Dong Mixed Nuts (20g Solo Pack)',
    category: 'Snacks',
    subcategory: 'Nuts & Seeds',
    price: 5.00,
    stockQuantity: 60,
    imageUrl: '/assets/menu/ding-dong-mixed-nuts-solo.webp',
    color: '#dc2626',
    badgeText: 'Ding Dong 20g',
    icon: '🥜'
  },
  {
    id: 'ding-dong-mixed-nuts-big',
    name: 'Ding Dong Mixed Nuts Big Pack (95g)',
    category: 'Snacks',
    subcategory: 'Nuts & Seeds',
    price: 24.00,
    stockQuantity: 36,
    imageUrl: '/assets/menu/ding-dong-mixed-nuts-big.webp',
    color: '#991b1b',
    badgeText: 'Ding Dong 95g',
    icon: '🥜'
  },
  {
    id: 'nagaraya-cracker-nuts-solo',
    name: 'Nagaraya Cracker Nuts (20g Solo Pack)',
    category: 'Snacks',
    subcategory: 'Nuts & Seeds',
    price: 7.00,
    stockQuantity: 50,
    imageUrl: '/assets/menu/nagaraya-cracker-nuts-solo.webp',
    color: '#15803d',
    badgeText: 'Nagaraya 20g',
    icon: '🥜'
  },
  {
    id: 'nagaraya-cracker-nuts-big',
    name: 'Nagaraya Cracker Nuts Big Pack (80g)',
    category: 'Snacks',
    subcategory: 'Nuts & Seeds',
    price: 24.00,
    stockQuantity: 36,
    imageUrl: '/assets/menu/nagaraya-cracker-nuts-big.webp',
    color: '#166534',
    badgeText: 'Nagaraya 80g',
    icon: '🥜'
  },
  {
    id: 'happy-peanuts-sachet',
    name: 'Happy Peanuts (Garlic, Chili 20g Sachet)',
    category: 'Snacks',
    subcategory: 'Nuts & Seeds',
    price: 5.00,
    stockQuantity: 60,
    imageUrl: '/assets/menu/happy-peanuts-sachet.webp',
    color: '#ea580c',
    badgeText: 'Happy Peanuts',
    icon: '🥜'
  },
  {
    id: 'growers-green-peas-sachet',
    name: 'Growers Green Peas / Garlic Peanuts (20g Sachet)',
    category: 'Snacks',
    subcategory: 'Nuts & Seeds',
    price: 6.00,
    stockQuantity: 50,
    imageUrl: '/assets/menu/growers-green-peas-sachet.webp',
    color: '#65a30d',
    badgeText: 'Growers Peas',
    icon: '🌱'
  },
  {
    id: 'dragon-sid-squash-seeds',
    name: 'Dragon Sid Squash Seeds (3g–5g Sachet)',
    category: 'Snacks',
    subcategory: 'Nuts & Seeds',
    price: 2.50,
    stockQuantity: 60,
    imageUrl: '/assets/menu/dragon-sid-squash-seeds.webp',
    color: '#eab308',
    badgeText: 'Dragon Sid',
    icon: '🌻'
  },

  // ==========================================
  // BUDGET & HANGING "PISO CHICHIRYA"
  // ==========================================
  {
    id: 'lumpia-shanghai-snack-pouch',
    name: 'Lumpia Shanghai Snack (12g–15g Pouch)',
    category: 'Snacks',
    subcategory: 'Budget & Piso Chichirya',
    price: 2.50,
    stockQuantity: 60,
    imageUrl: '/assets/menu/lumpia-shanghai-snack-pouch.webp',
    color: '#dc2626',
    badgeText: 'Lumpia Snack',
    icon: '🥟'
  },
  {
    id: 'kropek-kiss-crackers-pouch',
    name: 'Kropek / Kiss Crackers / Yumshots (10g–15g Pouch)',
    category: 'Snacks',
    subcategory: 'Budget & Piso Chichirya',
    price: 2.50,
    stockQuantity: 60,
    imageUrl: '/assets/menu/kropek-kiss-crackers-pouch.webp',
    color: '#f97316',
    badgeText: 'Kropek / Kiss',
    icon: '🦐'
  },
  {
    id: 'vinegar-pusit-cracklets-pouch',
    name: 'Vinegar Pusit / Sizzling Bangus Crackers (10g–15g Pouch)',
    category: 'Snacks',
    subcategory: 'Budget & Piso Chichirya',
    price: 2.50,
    stockQuantity: 60,
    imageUrl: '/assets/menu/vinegar-pusit-cracklets-pouch.webp',
    color: '#0284c7',
    badgeText: 'Vinegar Pusit',
    icon: '🦑'
  },
  {
    id: 'rinbee-cheese-sticks-pouch',
    name: 'Rinbee Cheese Sticks (18g Pouch)',
    category: 'Snacks',
    subcategory: 'Budget & Piso Chichirya',
    price: 6.00,
    stockQuantity: 50,
    imageUrl: '/assets/menu/rinbee-cheese-sticks-pouch.webp',
    color: '#eab308',
    badgeText: 'Rinbee 18g',
    icon: '🧀'
  },
  {
    id: 'wonder-boy-cheez-it-pouch',
    name: 'Wonder Boy / Cheez-It (15g Pouch)',
    category: 'Snacks',
    subcategory: 'Budget & Piso Chichirya',
    price: 4.00,
    stockQuantity: 50,
    imageUrl: '/assets/menu/wonder-boy-cheez-it-pouch.webp',
    color: '#f59e0b',
    badgeText: 'Wonder Boy',
    icon: '🧀'
  }
]

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// Generate clean professional display mockup on a pure solid white background
function generateProductWhiteBgSvg(item) {
  const brandColor = item.color || '#d97706'
  const icon = item.icon || '🍜'
  const badgeRaw = String(item.badgeText || item.subcategory || 'Item').toUpperCase()
  const badgeText = escapeXml(badgeRaw)
  
  // Format short clean display title
  let displayTitle = item.name.split('(')[0].trim()
  if (displayTitle.length > 24) {
    displayTitle = displayTitle.substring(0, 22) + '…'
  }
  const cleanTitle = escapeXml(displayTitle)

  return `
<svg width="320" height="320" viewBox="0 0 320 320" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Card container soft shadow -->
    <filter id="shadow-${item.id}" x="-10%" y="-10%" width="125%" height="125%">
      <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#000000" flood-opacity="0.08" />
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000000" flood-opacity="0.05" />
    </filter>

    <linearGradient id="bgGrad-${item.id}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="100%" stop-color="#f8fafc" />
    </linearGradient>

    <linearGradient id="brandGrad-${item.id}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${brandColor}" />
      <stop offset="100%" stop-color="${brandColor}" stop-opacity="0.85" />
    </linearGradient>

    <linearGradient id="plateGrad-${item.id}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${brandColor}" stop-opacity="0.14" />
      <stop offset="100%" stop-color="${brandColor}" stop-opacity="0.04" />
    </linearGradient>
  </defs>

  <!-- PURE WHITE SOLID BACKGROUND -->
  <rect width="320" height="320" fill="#ffffff" />

  <!-- Main Showcase Card On Pure White Background -->
  <g filter="url(#shadow-${item.id})">
    <rect x="20" y="18" width="280" height="284" rx="24" fill="url(#bgGrad-${item.id})" stroke="#e2e8f0" stroke-width="1.5" />
  </g>

  <!-- Subtle Inner Pedestal Ring -->
  <circle cx="160" cy="132" r="68" fill="url(#plateGrad-${item.id})" stroke="${brandColor}" stroke-opacity="0.25" stroke-width="1.5" stroke-dasharray="6 3" />
  <circle cx="160" cy="132" r="54" fill="#ffffff" stroke="#f1f5f9" stroke-width="2" />

  <!-- Product Icon Graphic -->
  <text x="160" y="156" font-size="60" text-anchor="middle" font-family="'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif">
    ${icon}
  </text>

  <!-- Top Badge Tag -->
  <g transform="translate(160, 36)">
    <rect x="-65" y="-12" width="130" height="24" rx="12" fill="url(#brandGrad-${item.id})" />
    <text x="0" y="4.5" font-size="10.5" font-weight="800" fill="#ffffff" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" letter-spacing="0.5">
      ${badgeText}
    </text>
  </g>

  <!-- Product Name Label -->
  <text x="160" y="234" font-size="13" font-weight="700" fill="#0f172a" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">
    ${cleanTitle}
  </text>

  <!-- Subcategory Subtitle -->
  <text x="160" y="254" font-size="11" font-weight="500" fill="#64748b" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">
    ${escapeXml(item.subcategory)}
  </text>

  <!-- Price Pill Tag -->
  <g transform="translate(160, 278)">
    <rect x="-42" y="-10" width="84" height="20" rx="10" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="1" />
    <text x="0" y="4" font-size="11" font-weight="700" fill="#b45309" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">
      ₱${item.price.toFixed(2)}
    </text>
  </g>
</svg>
`
}

async function buildAll() {
  console.log(`Processing ${ITEMS.length} Philippine catalog items...`)
  
  // Deduplicate items by ID
  const seenIds = new Set()
  const uniqueItems = []
  for (const item of ITEMS) {
    if (seenIds.has(item.id)) {
      console.warn(`Duplicate item ID detected and skipped: ${item.id}`)
      continue
    }
    seenIds.add(item.id)
    uniqueItems.push(item)
  }

  console.log(`Unique items to generate: ${uniqueItems.length}`)

  // Write JS preset catalog without descriptions
  const catalogJsContent = `// Philippine iCafe Menu Catalog Presets (No Descriptions)
export const PHILIPPINE_MENU_CATEGORIES = ${JSON.stringify(PHILIPPINE_MENU_CATEGORIES, null, 2)}

export const PHILIPPINE_MENU_CATALOG = ${JSON.stringify(uniqueItems, null, 2)}
`

  const presetFilePath = path.join(repoRoot, 'apps', 'admin', 'src', 'data', 'philippineMenuPresets.js')
  fs.writeFileSync(presetFilePath, catalogJsContent, 'utf8')
  console.log(`Updated presets catalog file at ${presetFilePath}`)

  // Generate mockups/pictures for all items
  for (let i = 0; i < uniqueItems.length; i++) {
    const item = uniqueItems[i]
    const filename = path.basename(item.imageUrl)
    console.log(`[${i + 1}/${uniqueItems.length}] Building image for ${item.name}...`)

    // Generate clean solid-white SVG mockup
    const svgContent = generateProductWhiteBgSvg(item)
    const svgBuffer = Buffer.from(svgContent)

    const webpBuffer = await sharp(svgBuffer)
      .resize(320, 320)
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .webp({ quality: 90 })
      .toBuffer()

    for (const dir of targetDirs) {
      fs.writeFileSync(path.join(dir, filename), webpBuffer)
    }
  }

  console.log(`\nSuccessfully created all ${uniqueItems.length} product images with white background!`)
}

buildAll().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
