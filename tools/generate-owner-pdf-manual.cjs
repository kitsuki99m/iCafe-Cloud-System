const fs = require('fs');
const path = require('path');
const { jsPDF } = require('jspdf');
const autoTable = require('jspdf-autotable').default || require('jspdf-autotable');

const doc = new jsPDF({
  orientation: 'portrait',
  unit: 'mm',
  format: 'a4',
});

const pageWidth = 210;
const pageHeight = 297;
const margin = 14;
const contentWidth = pageWidth - (margin * 2);

// Colors
const C_DARK = [11, 15, 23];         // #0B0F17
const C_SURFACE = [26, 34, 50];     // #1A2232
const C_GOLD = [232, 163, 61];      // #E8A33D
const C_BLUE = [56, 189, 248];      // #38BDF8
const C_GRAY = [100, 116, 139];     // Slate gray
const C_BG_CARD = [241, 245, 249];  // Very light gray/slate
const C_BORDER = [203, 213, 225];

function addHeaderFooter(doc, pageNum, totalPages, title = 'BUSINESS OWNER & EXECUTIVE GUIDE') {
  doc.saveGraphicsState();
  
  // Header
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C_GOLD);
  doc.text('iCAFE CLOUD MANAGEMENT', margin, 10);
  
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C_GRAY);
  doc.text(title, margin + 45, 10);
  
  doc.setDrawColor(...C_BORDER);
  doc.setLineWidth(0.3);
  doc.line(margin, 12, pageWidth - margin, 12);

  // Footer
  doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
  doc.setFontSize(8);
  doc.setTextColor(...C_GRAY);
  doc.text('Confidential — For Cafe Business Owners & Executives Only', margin, pageHeight - 7);
  doc.text(`Page ${pageNum} of ${totalPages}`, pageWidth - margin - 20, pageHeight - 7);

  doc.restoreGraphicsState();
}

function drawSectionHeading(doc, y, title, subtitle) {
  doc.setFillColor(...C_SURFACE);
  doc.roundedRect(margin, y, contentWidth, 10, 1.5, 1.5, 'F');
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(255, 255, 255);
  doc.text(title.toUpperCase(), margin + 4, y + 6.8);
  
  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...C_GOLD);
    doc.text(subtitle, pageWidth - margin - doc.getTextWidth(subtitle) - 4, y + 6.8);
  }
  return y + 14;
}

function drawCallout(doc, y, title, lines, color = C_GOLD, height = 24) {
  doc.saveGraphicsState();
  doc.setFillColor(254, 252, 232);
  doc.setDrawColor(...color);
  doc.setLineWidth(0.6);
  doc.roundedRect(margin, y, contentWidth, height, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...color);
  doc.text(title, margin + 4, y + 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  let curY = y + 10;
  lines.forEach(line => {
    doc.text(line, margin + 4, curY);
    curY += 4.2;
  });

  doc.restoreGraphicsState();
  return y + height + 4;
}

// ==========================================
// PAGE 1: TITLE & EXECUTIVE SUMMARY
// ==========================================
doc.setFillColor(...C_DARK);
doc.rect(0, 0, pageWidth, pageHeight, 'F');

// Top Accent Banner
doc.setFillColor(...C_GOLD);
doc.rect(0, 0, pageWidth, 5, 'F');

// Decorative Logo Box
doc.setFillColor(...C_SURFACE);
doc.roundedRect(margin, 25, 28, 28, 3, 3, 'F');
doc.setFont('helvetica', 'bold');
doc.setFontSize(20);
doc.setTextColor(...C_GOLD);
doc.text('iC', margin + 6, 44);

// Main Titles
doc.setFont('helvetica', 'bold');
doc.setFontSize(24);
doc.setTextColor(255, 255, 255);
doc.text('iCafe Cloud Management', margin, 66);

doc.setFontSize(14);
doc.setTextColor(...C_GOLD);
doc.text('BUSINESS OWNER & EXECUTIVE GUIDE', margin, 74);

doc.setFont('helvetica', 'normal');
doc.setFontSize(10);
doc.setTextColor(148, 163, 184);
doc.text('Strategic Governance, Revenue Maximization, Staff Audits & Multi-Branch Control', margin, 81);

// Horizontal Rule
doc.setDrawColor(51, 65, 85);
doc.setLineWidth(0.5);
doc.line(margin, 88, pageWidth - margin, 88);

// Executive Overview Card
doc.setFillColor(...C_SURFACE);
doc.roundedRect(margin, 95, contentWidth, 54, 2, 2, 'F');

doc.setFont('helvetica', 'bold');
doc.setFontSize(11);
doc.setTextColor(...C_BLUE);
doc.text('EXECUTIVE VALUE PROPOSITION & CAPABILITIES', margin + 6, 104);

doc.setFont('helvetica', 'normal');
doc.setFontSize(8.8);
doc.setTextColor(226, 232, 240);
const descLines = [
  '• Real-Time Revenue Audits: Live oversight of gross receipts, cash top-ups, POS snack sales & shift variances.',
  '• Anywhere Cloud Admin: Manage tariffs, staff, and monitor floor matrix from mobile, tablet, or home PC.',
  '• Leakage Prevention: Cash drawer reconciliation forces cashiers to account for every centavo at shift end.',
  '• Multi-Branch Expansion: Single dashboard support for multi-store chains with isolated branch billing.',
  '• Offline Durability: Zero business disruption when internet drops; automatic LAN synchronization upon reconnect.'
];
let dy = 112;
descLines.forEach(l => { doc.text(l, margin + 6, dy); dy += 6.5; });

// Two-Column Section Summary
const cardW = (contentWidth - 6) / 2;

// Column 1
doc.setFillColor(30, 41, 59);
doc.roundedRect(margin, 157, cardW, 76, 2, 2, 'F');
doc.setFont('helvetica', 'bold');
doc.setFontSize(9.5);
doc.setTextColor(...C_GOLD);
doc.text('FINANCIALS & REVENUE CONTROL', margin + 6, 167);
doc.setFont('helvetica', 'normal');
doc.setFontSize(8);
doc.setTextColor(203, 213, 225);
const c1Text = [
  '• Hourly Tariffs: Regular, VIP, and promotional rate plans.',
  '• Cashier Shift Audits: Eliminating cash drawer discrepancies.',
  '• GCash Integration: Seamless digital QR customer top-ups.',
  '• Unearned Wallet vs Recognized Session Revenue.',
  '• Food & Beverage POS: High-margin snack & beverage tracking.',
  '• Automated EOD (End-of-Day) financial accounting.'
];
let cy1 = 175;
c1Text.forEach(t => { doc.text(t, margin + 6, cy1); cy1 += 7; });

// Column 2
doc.setFillColor(30, 41, 59);
doc.roundedRect(margin + cardW + 6, 157, cardW, 76, 2, 2, 'F');
doc.setFont('helvetica', 'bold');
doc.setFontSize(9.5);
doc.setTextColor(...C_BLUE);
doc.text('SECURITY, FLEET & DISASTER RESILIENCE', margin + cardW + 12, 167);
doc.setFont('helvetica', 'normal');
doc.setFontSize(8);
doc.setTextColor(203, 213, 225);
const c2Text = [
  '• Multi-Branch & Station Fleet layout governance.',
  '• Segregation of Duties: Owner vs Manager vs Cashier.',
  '• Master PIN Security: Restricting kiosk escape hatches.',
  '• Zero-Downtime ISP Outage & Crash Recovery Playbook.',
  '• Deep Freeze & Diskless (iCafe8/CCBoot) best practices.',
  '• Pre-Launch Owner Checklist before opening doors.'
];
let cy2 = 175;
c2Text.forEach(t => { doc.text(t, margin + cardW + 12, cy2); cy2 += 7; });

// Metadata Block at Bottom
doc.setFillColor(15, 23, 42);
doc.roundedRect(margin, 240, contentWidth, 38, 2, 2, 'F');

doc.setFont('helvetica', 'bold');
doc.setFontSize(8.5);
doc.setTextColor(...C_GOLD);
doc.text('EXECUTIVE SUMMARY & SYSTEM ATTRIBUTES', margin + 6, 248);

doc.setFont('helvetica', 'normal');
doc.setFontSize(8);
doc.setTextColor(148, 163, 184);
doc.text('Target Audience: Cybercafe Owners, Franchise Operators & General Managers', margin + 6, 255);
doc.text('Platform: Web Cloud Admin (Vercel) + Desktop Console + Hybrid Edge Node', margin + 6, 261);
doc.text('Security Level: Cryptographic Timing-Safe Master PIN, Argon2 & Supabase RLS', margin + 6, 267);

doc.text('Supported Tiers: Bronze (1-15 PCs), Silver (16-30), Gold (31-60), Ultra (60+)', margin + 105, 255);
doc.text('Currency & Regionalization: Philippine Peso (PHP PHP ) · Asia/Manila (PHT)', margin + 105, 261);
doc.text('Support & Observability: Central Error Fingerprinting & Auto-Backups', margin + 105, 267);

doc.setFontSize(8);
doc.setTextColor(100, 116, 139);
doc.text('Confidential Document — Property of iCafe Management System Owner', margin, pageHeight - 8);

// ==========================================
// PAGE 2: FINANCIAL AUDITING & TARIFFS
// ==========================================
doc.addPage();
addHeaderFooter(doc, 2, 5, 'FINANCIAL AUDITS, TARIFFS & REVENUE CONTROL');

let y = 18;
y = drawSectionHeading(doc, y, '1. Hourly Tariffs, Rate Plans & Dynamic Pricing', 'Pricing Strategy');

const tariffData = [
  ['Standard Hourly', 'Regular walk-in gaming and internet rate.', 'Hourly rate charged in fractional seconds. Min spend applies.', 'Default'],
  ['Member Discount Rate', 'Preferred lower rate for registered members.', 'Incentivizes membership sign-up and wallet balance deposits.', 'Loyalty'],
  ['VIP Gaming Zone', 'Premium rate for high-spec RTX / 240Hz PCs.', 'Assigned to specific PC groups in Floor Matrix.', 'Premium'],
  ['Night Package / Promos', 'Bulk hours bundle (e.g. PHP 100 for 6 hours).', 'Non-refundable upfront block time during off-peak hours.', 'Promotion'],
  ['Custom Promo Vouchers', 'Redeemable alphanumeric code (XXXX-XXXX).', 'Grants bonus wallet credit or bonus time via Voucher modal.', 'Marketing']
];

autoTable(doc, {
  startY: y,
  head: [['Rate Plan Type', 'Business Purpose', 'Billing Calculation & Behavior', 'Strategy Tier']],
  body: tariffData,
  margin: { left: margin, right: margin },
  styles: { fontSize: 7.8, cellPadding: 2.2, textColor: [30, 41, 59] },
  headStyles: { fillColor: C_SURFACE, textColor: [255, 255, 255], fontStyle: 'bold' },
  alternateRowStyles: { fillColor: C_BG_CARD },
  columnStyles: {
    0: { cellWidth: 35, fontStyle: 'bold', textColor: C_DARK },
    1: { cellWidth: 50 },
    2: { cellWidth: 68 },
    3: { cellWidth: 27, fontStyle: 'bold', textColor: [180, 83, 9] }
  }
});

y = doc.lastAutoTable.finalY + 8;
y = drawSectionHeading(doc, y, '2. Cashier Shift Reconciliation & Anti-Theft', 'Cash Drawer Audits');

const shiftData = [
  ['Shift Start Float', 'Cashier inputs beginning cash drawer float (e.g. PHP 1,000 in small change).', 'Float is recorded separately from operational revenue.'],
  ['Real-Time Tally', 'System tracks cash top-ups, walk-in guest sessions, and POS food/drink sales.', 'Logged to SQLite and Supabase transaction ledgers.'],
  ['Shift Handover', 'At shift end, cashier counts physical cash and inputs total in Shift modal.', 'System automatically computes Over / Short variance.'],
  ['Audit Discrepancy', 'Variances are flagged in red. Cashier cannot edit historical transactions.', 'Permanently archived in Shift Management report for Owner review.']
];

autoTable(doc, {
  startY: y,
  head: [['Shift Stage', 'Operational Action & Verification', 'System Financial Protection']],
  body: shiftData,
  margin: { left: margin, right: margin },
  styles: { fontSize: 7.8, cellPadding: 2.2, textColor: [30, 41, 59] },
  headStyles: { fillColor: C_SURFACE, textColor: [255, 255, 255], fontStyle: 'bold' },
  alternateRowStyles: { fillColor: C_BG_CARD },
  columnStyles: {
    0: { cellWidth: 35, fontStyle: 'bold', textColor: C_DARK },
    1: { cellWidth: 75 },
    2: { cellWidth: 70, fontStyle: 'italic', textColor: [30, 41, 59] }
  }
});

y = doc.lastAutoTable.finalY + 8;
y = drawCallout(doc, y, 'ACCOUNTING PRINCIPLE: RECOGNIZED REVENUE VS. WALLET LIABILITIES', [
  '• Customer Wallet Balance (Prepaid Time): When a member deposits PHP 500, this is recorded as a liability in branch_wallet_ledger.',
  '• Recognized Earnings: Revenue is officially booked as gross earnings ONLY when time is consumed on a PC or snacks are purchased.',
  '• The Overview & Analytics dashboard separates Daily Gross from Unspent Member Balances to provide 100% GAAP accounting accuracy.'
], [14, 165, 233], 24);

// ==========================================
// PAGE 3: MULTI-BRANCH & FLEET GOVERNANCE
// ==========================================
doc.addPage();
addHeaderFooter(doc, 3, 5, 'MULTI-BRANCH EXPANSION & FLEET GOVERNANCE');

y = 18;
y = drawSectionHeading(doc, y, '1. Multi-Branch Operations & Subscription Tiers', 'Enterprise Growth');

const tiersData = [
  ['Bronze Tier', '1 – 15 PCs', 'Designed for single-store esports hubs or boutique gaming cafes.', 'PHP 1,499 / mo'],
  ['Silver Tier', '16 – 30 PCs', 'Standard tier for medium-sized computer shops with active member bases.', 'PHP 2,499 / mo'],
  ['Gold Tier', '31 – 60 PCs', 'High-density gaming arenas, multi-floor layouts, and tournament setups.', 'PHP 3,999 / mo'],
  ['Ultra Tier', '60+ PCs', 'Enterprise multi-branch chains with custom station capacities and priority support.', 'Custom Quote']
];

autoTable(doc, {
  startY: y,
  head: [['Package Tier', 'Station Quota', 'Target Environment & Scale', 'Standard Base']],
  body: tiersData,
  margin: { left: margin, right: margin },
  styles: { fontSize: 7.8, cellPadding: 2.2, textColor: [30, 41, 59] },
  headStyles: { fillColor: C_SURFACE, textColor: [255, 255, 255], fontStyle: 'bold' },
  alternateRowStyles: { fillColor: C_BG_CARD },
  columnStyles: {
    0: { cellWidth: 32, fontStyle: 'bold', textColor: C_DARK },
    1: { cellWidth: 28, fontStyle: 'bold', textColor: C_BLUE },
    2: { cellWidth: 88 },
    3: { cellWidth: 32, fontStyle: 'bold', textColor: [180, 83, 9] }
  }
});

y = doc.lastAutoTable.finalY + 8;
y = drawSectionHeading(doc, y, '2. PC Fleet Management, Pairing & Floor Matrix', 'Hardware Control');

const fleetData = [
  ['Visual Floor Matrix', 'Customize grid layout to mirror your physical room layout (Regular, VIP, Streaming).', 'Realtime occupancy, active player name, time remaining, and hardware status.'],
  ['One-Time Pairing (OTP)', 'Generate an 8-character OTP (XXXX-XXXX) in Cloud Admin -> Clients -> Pair Station.', 'Client PC verifies code against Supabase and binds permanently to branch.'],
  ['Remote Power Controls', 'Bulk or individual PC commands: Wake-on-LAN, Remote Reboot, Remote Shutdown.', 'Allows closing all stations simultaneously at end-of-business with 1 click.'],
  ['Station Lock / Maintenance', 'Mark PCs into Maintenance or Reserved state to prevent customer login.', 'Useful for cleaning, hardware upgrades, or private tournament bookings.']
];

autoTable(doc, {
  startY: y,
  head: [['Fleet Capability', 'Operational Procedure', 'Executive Benefit & Safety']],
  body: fleetData,
  margin: { left: margin, right: margin },
  styles: { fontSize: 7.8, cellPadding: 2.2, textColor: [30, 41, 59] },
  headStyles: { fillColor: C_SURFACE, textColor: [255, 255, 255], fontStyle: 'bold' },
  alternateRowStyles: { fillColor: C_BG_CARD },
  columnStyles: {
    0: { cellWidth: 38, fontStyle: 'bold', textColor: C_DARK },
    1: { cellWidth: 72 },
    2: { cellWidth: 70, fontStyle: 'italic', textColor: [30, 41, 59] }
  }
});

y = doc.lastAutoTable.finalY + 8;
y = drawCallout(doc, y, 'STATION CAP ENFORCEMENT & INTEGRITY', [
  '• Organization Station Cap: Enforced at the Supabase database level via race-safe PostgreSQL triggers.',
  '• Over-enrollment protection: Client stations cannot be paired beyond your subscribed quota without upgrading.',
  '• Unpairing & Hardware Replacement: If a PC motherboard dies, simply unpair the station in Cloud Admin to free up its quota slot.'
], [16, 185, 129], 22);

// ==========================================
// PAGE 4: ACCESS CONTROL & ANTI-THEFT
// ==========================================
doc.addPage();
addHeaderFooter(doc, 4, 5, 'ACCESS CONTROL, STAFF ROLES & ANTI-THEFT');

y = 18;
y = drawSectionHeading(doc, y, '1. Role Hierarchy & Segregation of Duties', 'Security Governance');

const rolesDetail = [
  ['Owner', 'All Branches', 'Full financial reports, bank/GCash setup, subscription billing, staff hiring/firing, developer quotes.'],
  ['Branch Admin', 'Single Branch', 'Branch PC layout, rate plans, inventory management, inviting local cashiers, day-end reviews.'],
  ['Shift Manager', 'Assigned Shift', 'Cashier shift supervision, overriding locked PCs, verifying drawer cash, voiding erroneous orders.'],
  ['Front-Desk Cashier', 'Terminal POS', 'Clock-in/out, top-ups, guest time, snack orders, session start/end. NO access to settings or tariffs.']
];

autoTable(doc, {
  startY: y,
  head: [['Role Tier', 'Permitted Scope', 'Access Rights & Security Restrictions']],
  body: rolesDetail,
  margin: { left: margin, right: margin },
  styles: { fontSize: 7.8, cellPadding: 2.2, textColor: [30, 41, 59] },
  headStyles: { fillColor: C_SURFACE, textColor: [255, 255, 255], fontStyle: 'bold' },
  alternateRowStyles: { fillColor: C_BG_CARD },
  columnStyles: {
    0: { cellWidth: 35, fontStyle: 'bold', textColor: C_DARK },
    1: { cellWidth: 32, fontStyle: 'italic', textColor: C_BLUE },
    2: { cellWidth: 113 }
  }
});

y = doc.lastAutoTable.finalY + 8;
y = drawSectionHeading(doc, y, '2. Preventing Common Cybercafe Fraud & Leakages', 'Audit Protections');

const theftData = [
  ['Unrecorded Top-ups', 'Cashier receives cash from customer but does not encode it.', 'Session cannot start without balance; kiosk remains locked until payment is recorded.'],
  ['Fake Over/Short Reports', 'Cashier claims drawer was short due to customer disputes.', 'Shift report logs exact timestamps of every transaction; receipts are immutable.'],
  ['Customer Kiosk Escape', 'Customer attempts to close client app to play for free.', 'Win32 low-level hook blocks Alt+Tab, Alt+F4, and Win key. Only Master PIN exits.'],
  ['Unauthorized Discounts', 'Cashier applies custom discounts for friends.', 'Hourly rates are strictly bound to server rate plans; cashiers cannot modify tariffs.']
];

autoTable(doc, {
  startY: y,
  head: [['Vulnerability', 'Cashier / Customer Threat', 'iCafe Built-in Countermeasure']],
  body: theftData,
  margin: { left: margin, right: margin },
  styles: { fontSize: 7.8, cellPadding: 2.2, textColor: [30, 41, 59] },
  headStyles: { fillColor: C_SURFACE, textColor: [255, 255, 255], fontStyle: 'bold' },
  alternateRowStyles: { fillColor: C_BG_CARD },
  columnStyles: {
    0: { cellWidth: 38, fontStyle: 'bold', textColor: [180, 83, 9] },
    1: { cellWidth: 62 },
    2: { cellWidth: 80, fontStyle: 'italic', textColor: [30, 41, 59] }
  }
});

y = doc.lastAutoTable.finalY + 8;
y = drawCallout(doc, y, 'EXECUTIVE RULE: MASTER PIN CUSTODY', [
  '• The Station Setup Master PIN (Default: 062321) must NEVER be shared with regular cashiers.',
  '• Master PIN grants total control to quit kiosk, unpair stations, and override server connection settings.',
  '• Only the Owner and trusted Senior Managers should possess the Master PIN. Rotate periodically via AEZAKMI_STATION_SETUP_MASTER_PIN.'
], [220, 38, 38], 22);

// ==========================================
// PAGE 5: DISASTER RECOVERY & OWNER CHECKLIST
// ==========================================
doc.addPage();
addHeaderFooter(doc, 5, 5, 'DISASTER RECOVERY & PRE-LAUNCH CHECKLIST');

y = 18;
y = drawSectionHeading(doc, y, '1. Business Continuity & Disaster Recovery Playbook', 'Crisis Management');

const crisisData = [
  ['Internet Service Outage (ISP Drop)', 'Switching is 100% automated. Customer stations immediately fall back to local LAN Cafe Edge (port 3000). Gamers experience zero disruption.', 'Cashier continues selling time and snacks locally. Backlog syncs to Cloud when WAN returns.'],
  ['Sudden Power Blink / Trip', 'Remaining seconds are checkpointed into SQLite and Cloud database upon unexpected interruption.', 'Customer reboots PC, signs back in, and remaining minutes are restored automatically.'],
  ['Server Hardware Crash', 'Automated verified database backups execute every 6 hours, retaining 28 rolling snapshots in ./data/backups.', 'Restore latest snapshot via: node backend/scripts/restore-backup.mjs <backup-file>.']
];

autoTable(doc, {
  startY: y,
  head: [['Crisis Event', 'Automated Architectural Safety Net', 'Owner / Staff Recovery Protocol']],
  body: crisisData,
  margin: { left: margin, right: margin },
  styles: { fontSize: 7.8, cellPadding: 2.2, textColor: [30, 41, 59] },
  headStyles: { fillColor: C_SURFACE, textColor: [255, 255, 255], fontStyle: 'bold' },
  alternateRowStyles: { fillColor: C_BG_CARD },
  columnStyles: {
    0: { cellWidth: 42, fontStyle: 'bold', textColor: [220, 38, 38] },
    1: { cellWidth: 78 },
    2: { cellWidth: 60, fontStyle: 'italic', textColor: [30, 41, 59] }
  }
});

y = doc.lastAutoTable.finalY + 8;
y = drawSectionHeading(doc, y, '2. Owner Pre-Launch Operational Checklist', '10-Point Readiness Verification');

const checklistData = [
  ['1', 'Master PIN Changed', 'Default 062321 replaced with confidential 6-digit owner PIN.', '[  ] Verified'],
  ['2', 'Static Server LAN IP', 'Cashier/Server PC assigned static IP (e.g. 192.168.1.100).', '[  ] Verified'],
  ['3', 'Firewall Port 3000 Open', 'TCP port 3000 allowed inbound for LAN fallback communication.', '[  ] Verified'],
  ['4', 'Rate Plans Configured', 'Hourly rates, member tariffs, and night promo packages set.', '[  ] Verified'],
  ['5', 'Initial Cashier Invited', 'Staff account created; temporary password delivered & changed.', '[  ] Verified'],
  ['6', 'All Client PCs Paired', 'Each PC bound via 8-digit OTP (XXXX-XXXX) in Floor Matrix.', '[  ] Verified'],
  ['7', 'Deep Freeze Unfrozen Partition', 'Station credential folder (.aezakmi-customer) kept persistent.', '[  ] Verified'],
  ['8', 'Windows Defender Exclusions', 'Client & server install folders whitelisted against false flags.', '[  ] Verified'],
  ['9', 'GCash QR Uploaded', 'Digital payment QR code uploaded in Settings -> Payments.', '[  ] Verified'],
  ['10', 'Automated Backup Verified', 'Verified backups folder (./data/backups) is creating snapshots.', '[  ] Verified']
];

autoTable(doc, {
  startY: y,
  head: [['#', 'Operational Checkpoint', 'Action / Requirement', 'Sign-Off']],
  body: checklistData,
  margin: { left: margin, right: margin },
  styles: { fontSize: 7.5, cellPadding: 1.8, textColor: [30, 41, 59] },
  headStyles: { fillColor: C_SURFACE, textColor: [255, 255, 255], fontStyle: 'bold' },
  alternateRowStyles: { fillColor: C_BG_CARD },
  columnStyles: {
    0: { cellWidth: 10, fontStyle: 'bold', textColor: C_GOLD },
    1: { cellWidth: 46, fontStyle: 'bold' },
    2: { cellWidth: 98 },
    3: { cellWidth: 26, fontStyle: 'bold', textColor: C_BLUE }
  }
});

y = doc.lastAutoTable.finalY + 6;
y = drawCallout(doc, y, 'EXECUTIVE SUMMARY', [
  '• The iCafe system is designed to give you peace of mind, operational transparency, and maximum profitability.',
  '• Monitor your business anytime, anywhere at your cloud admin URL: https://icafe-aezakmi.vercel.app',
  '• For system assistance or multi-branch upgrades, contact developer platform support.'
], [16, 185, 129], 20);

// Save PDF to disk
const outputDir = path.join(__dirname, '..', 'docs');
fs.mkdirSync(outputDir, { recursive: true });
const targetFile = path.join(outputDir, 'iCafe_Business_Owner_Guide.pdf');
const pdfBytes = Buffer.from(doc.output('arraybuffer'));
fs.writeFileSync(targetFile, pdfBytes);

console.log('PDF Business Owner Guide generated successfully at: ' + targetFile);
console.log('Size: ' + (pdfBytes.length / 1024).toFixed(1) + ' KB, Pages: ' + doc.internal.getNumberOfPages());
