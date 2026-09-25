export const DEV_MOCK_USER = {
  id: "dev-member-1",
  memberId: "dev-member-1",
  username: "DevGamer",
  name: "Developer (VIP)",
  role: "customer",
  tier: "VIP",
  wallet: 750,
  walletBalance: 750,
  email: "dev@icafe.local",
  phone: "09123456789",
  createdAt: new Date().toISOString(),
};

export function isDevBypassEnabled() {
  if (import.meta.env.PROD) return false;

  // Under Electron runtime or kiosk environment, strictly disable bypass so real station locking & pairing are enforced
  if (typeof window !== "undefined") {
    if (window.aezakmiClient != null || (navigator.userAgent && /electron/i.test(navigator.userAgent))) {
      return false;
    }
  }

  if (["true", "1", "yes"].includes(String(import.meta.env.VITE_DEV_BYPASS || "").trim().toLowerCase())) {
    return true;
  }
  if (import.meta.env.MODE === "devbypass") {
    return true;
  }
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    if (params.get("bypass") === "true" || params.get("dev") === "true" || params.get("skip") === "true") {
      return true;
    }
    if (localStorage.getItem("aezakmi.dev.bypass") === "true") {
      return true;
    }
  }
  return false;
}

export function setDevBypass(enabled) {
  if (typeof window !== "undefined") {
    if (enabled) {
      localStorage.setItem("aezakmi.dev.bypass", "true");
    } else {
      localStorage.removeItem("aezakmi.dev.bypass");
    }
    window.location.reload();
  }
}

export function getDevMockAppData() {
  const now = Date.now();
  const pc = {
    id: "1",
    name: "PC 01",
    label: "PC 01 — Esports Station",
    ipAddress: "127.0.0.1",
    status: "occupied",
    specs: "RTX 4080 • i7-14700K • 32GB RAM • 240Hz",
    session: {
      id: "dev-session-01",
      customerId: "dev-member-1",
      customerName: "Developer (VIP)",
      startedAt: new Date(now - 3600 * 1000 * 1.5).toISOString(),
      expiresAt: new Date(now + 3600 * 1000 * 2.5).toISOString(),
      endsAt: new Date(now + 3600 * 1000 * 2.5).toISOString(),
      remainingSeconds: 3600 * 2.5,
      prepaidSeconds: 3600 * 4,
      billableSeconds: 3600 * 1.5,
      observedAt: now,
      amount: 60,
      ratePlanId: "plan-vip-3h",
      billing: "prepaid",
      minutesTotal: 240,
    },
  };

  const ratePlans = [
    {
      id: "plan-std-1h",
      name: "Standard Rate (1 Hour)",
      code: "STD_1H",
      amount: 25,
      minutes: 60,
      baseMinutes: 60,
      bonusMinutes: 0,
      customerTier: "Regular",
      customerSelfService: true,
      isActive: true,
      eligible: true,
      walletStartEligible: true,
    },
    {
      id: "plan-vip-3h",
      name: "Esports Grinder (3 Hours + 30m Bonus)",
      code: "VIP_3H",
      amount: 60,
      minutes: 210,
      baseMinutes: 180,
      bonusMinutes: 30,
      customerTier: "VIP",
      customerSelfService: true,
      isActive: true,
      eligible: true,
      walletStartEligible: true,
    },
    {
      id: "plan-night-8h",
      name: "All-Night Pass (8 Hours)",
      code: "NIGHT_8H",
      amount: 130,
      minutes: 480,
      baseMinutes: 480,
      bonusMinutes: 60,
      customerTier: "Regular",
      customerSelfService: true,
      isActive: true,
      eligible: true,
      walletStartEligible: true,
    },
  ];

  const menuItems = [
    {
      id: "menu-1",
      name: "Pancit Canton w/ Egg",
      category: "Snacks",
      price: 45,
      stock: 35,
      isAvailable: true,
      description: "Chilimansi / Sweet & Spicy flavor with fried egg",
      imageUrl: "/assets/menu/lucky-me-pancit-canton-kalamansi.webp",
    },
    {
      id: "menu-2",
      name: "Crispy Fried Chicken Rice",
      category: "Meals",
      price: 95,
      stock: 20,
      isAvailable: true,
      description: "Golden crispy fried chicken with garlic rice and gravy",
      imageUrl: "/assets/menu/tapsilog.webp",
    },
    {
      id: "menu-3",
      name: "Mountain Dew 500ml",
      category: "Drinks",
      price: 35,
      stock: 50,
      isAvailable: true,
      description: "Ice cold citrus soda",
      imageUrl: "/assets/menu/mountain-dew-bottle.webp",
    },
    {
      id: "menu-4",
      name: "Iced Caramel Macchiato",
      category: "Drinks",
      price: 65,
      stock: 25,
      isAvailable: true,
      description: "Freshly brewed espresso with creamy caramel syrup",
      imageUrl: "/assets/menu/kopiko-78c.webp",
    },
    {
      id: "menu-5",
      name: "Cheesy Overload Nachos",
      category: "Snacks",
      price: 75,
      stock: 15,
      isAvailable: true,
      description: "Crispy tortilla chips smothered in warm cheese sauce & jalapeños",
      imageUrl: "/assets/menu/piattos-sour-cream.webp",
    },
    {
      id: "menu-6",
      name: "Hotdog Sandwich Deluxe",
      category: "Meals",
      price: 55,
      stock: 18,
      isAvailable: true,
      description: "Jumbo cheesy hotdog in toasted bun with cheese and mayo",
      imageUrl: "/assets/menu/tocilog.webp",
    },
  ];

  const announcements = [
    {
      id: "ann-1",
      title: "🍆 Weekend Valorant 5v5 Tournament",
      message: "Registration open at the cashier desk. Grand prize: ₱15,000 + 50 Hours Cybercafe Pass.",
      kind: "Tournament",
      isActive: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: "ann-2",
      title: "⚡ Fiber Supercharged 1Gbps",
      message: "Dual ISP failover online for ultra-low latency gaming (8ms ping).",
      kind: "Announcement",
      isActive: true,
      createdAt: new Date().toISOString(),
    },
  ];

  const myOrders = [
    {
      id: "order-dev-1",
      items: [
        { menuItemId: "menu-1", name: "Pancit Canton w/ Egg", quantity: 1, price: 45 },
        { menuItemId: "menu-3", name: "Mountain Dew 500ml", quantity: 1, price: 35 },
      ],
      totalAmount: 80,
      paymentMethod: "wallet",
      status: "preparing",
      createdAt: new Date(Date.now() - 300000).toISOString(),
    },
  ];

  return {
    pc,
    pcs: [pc],
    ratePlans,
    menuItems,
    announcements,
    myOrders,
    member: DEV_MOCK_USER,
    settings: {
      cafeName: "Aezakmi Cyber Esports Hub",
      branch: "Main Arena",
      currency: "PHP",
      defaultBilling: "prepaid",
      lowTimeWarningMinutes: 5,
    },
  };
}
