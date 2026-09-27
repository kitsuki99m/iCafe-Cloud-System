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
const C_LIGHT = [248, 250, 252];    // Off white
const C_BG_CARD = [241, 245, 249];  // Very light gray/slate
const C_BORDER = [203, 213, 225];

function addHeaderFooter(doc, pageNum, totalPages, title = 'OPERATOR & STAFF FIELD MANUAL') {
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
  doc.text('Confidential — For Authorized Cafe Operators & Staff Only', margin, pageHeight - 7);
  doc.text(`Page ${pageNum} of ${totalPages}`, pageWidth - margin - 20, pageHeight - 7);

  doc.restoreGraphicsState();
}

function drawSectionHeading(doc, y, title, subtitle) {
  doc.setFillColor(...C_SURFACE);
  doc.roundedRect(margin, y, contentWidth, 10, 1.5, 1.5, 'F');
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
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
  doc.setFillColor(254, 252, 232); // light yellow/gold tint
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
// PAGE 1: TITLE & COVER PAGE
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
doc.text('OPERATOR & STAFF FIELD MANUAL', margin, 74);

doc.setFont('helvetica', 'normal');
doc.setFontSize(10);
doc.setTextColor(148, 163, 184);
doc.text('Official Reference for Secret Keys, Employee Management & Production Operations', margin, 81);

// Horizontal Rule
doc.setDrawColor(51, 65, 85);
doc.setLineWidth(0.5);
doc.line(margin, 88, pageWidth - margin, 88);

// Summary Overview Card
doc.setFillColor(...C_SURFACE);
doc.roundedRect(margin, 95, contentWidth, 52, 2, 2, 'F');

doc.setFont('helvetica', 'bold');
doc.setFontSize(11);
doc.setTextColor(...C_BLUE);
doc.text('SYSTEM ARCHITECTURE & PRODUCTION READINESS', margin + 6, 104);

doc.setFont('helvetica', 'normal');
doc.setFontSize(8.8);
doc.setTextColor(226, 232, 240);
const descLines = [
  '• Cloud-Primary Engine: Supabase PostgreSQL database + 16 Deno Edge Functions + Vercel SPA.',
  '• High-Availability Cafe Edge: Local LAN Express & SQLite server with 100% offline durability.',
  '• Automated Verification: 659 passed regression tests (614 unit/regression + 45 cloud deployment).',
  '• High-Security Kiosk: Win32 API low-level keyboard hook + Electron hardened sandboxed IPC.',
  '• Financial Ledger: Transactional wallet deductions, atomic timer accounting & pause-aware billing.'
];
let dy = 112;
descLines.forEach(l => { doc.text(l, margin + 6, dy); dy += 6.5; });

// Two-Part Summary Cards
const cardW = (contentWidth - 6) / 2;

// Card 1
doc.setFillColor(30, 41, 59);
doc.roundedRect(margin, 155, cardW, 76, 2, 2, 'F');
doc.setFont('helvetica', 'bold');
doc.setFontSize(10);
doc.setTextColor(...C_GOLD);
doc.text('VOLUME 1: KEYS & STAFF ONBOARDING', margin + 6, 165);
doc.setFont('helvetica', 'normal');
doc.setFontSize(8);
doc.setTextColor(203, 213, 225);
const c1Text = [
  '• Secret Emergency Station shortcuts (Quit, Lock, Unlock).',
  '• Station Setup Master PIN security boundary.',
  '• Admin Terminal privacy lock and operational hotkeys.',
  '• Step-by-step Staff Employee invitation procedure.',
  '• Front-desk Cashier, Manager & Admin permission roles.',
  '• First-run mandatory credential change enforcement.'
];
let cy1 = 173;
c1Text.forEach(t => { doc.text(t, margin + 6, cy1); cy1 += 7; });

// Card 2
doc.setFillColor(30, 41, 59);
doc.roundedRect(margin + cardW + 6, 155, cardW, 76, 2, 2, 'F');
doc.setFont('helvetica', 'bold');
doc.setFontSize(10);
doc.setTextColor(...C_BLUE);
doc.text('VOLUME 2: PRODUCTION & DAY-TO-DAY', margin + cardW + 12, 165);
doc.setFont('helvetica', 'normal');
doc.setFontSize(8);
doc.setTextColor(203, 213, 225);
const c2Text = [
  '• Step-by-step production deployment checklist.',
  '• Handling day-to-day ISP Internet outages seamlessly.',
  '• Sudden PC crash & power blink session recovery.',
  '• Cashier shift handover & cash drawer reconciliation.',
  '• The 4 Golden Rules: Deep Freeze, Static IP, Defender.',
  '• Emergency station unpairing and troubleshooting.'
];
let cy2 = 173;
c2Text.forEach(t => { doc.text(t, margin + cardW + 12, cy2); cy2 += 7; });

// Metadata Block at Bottom
doc.setFillColor(15, 23, 42);
doc.roundedRect(margin, 240, contentWidth, 38, 2, 2, 'F');

doc.setFont('helvetica', 'bold');
doc.setFontSize(8.5);
doc.setTextColor(...C_GOLD);
doc.text('DEPLOYMENT SPECIFICATIONS', margin + 6, 248);

doc.setFont('helvetica', 'normal');
doc.setFontSize(8);
doc.setTextColor(148, 163, 184);
doc.text('Software Version: 1.0.0 (Release Candidate)', margin + 6, 255);
doc.text('Local Database: SQLite 3 (WAL mode) / Cloud: Supabase PG 15', margin + 6, 261);
doc.text('Customer Client: Electron 39.0.0 (NSIS Installer x64)', margin + 6, 267);

doc.text('Default Master PIN: 062321', margin + 105, 255);
doc.text('Default Member Password: 1234', margin + 105, 261);
doc.text('Local Edge Fallback Port: TCP 3000', margin + 105, 267);

// Footer
doc.setFontSize(8);
doc.setTextColor(100, 116, 139);
doc.text('Generated for iCafe Cloud Operations · Confidential Operator Manual', margin, pageHeight - 8);

// ==========================================
// PAGE 2: SHORTCUT KEYS & SECRET CODES
// ==========================================
doc.addPage();
addHeaderFooter(doc, 2, 5, 'VOLUME 1 — SECRET KEYS & SHORTCUTS');

let y = 18;
y = drawSectionHeading(doc, y, '1. Customer Station (Client PC) Shortcuts', 'Kiosk & Emergency Controls');

const customerShortcuts = [
  ['Alt + Shift + W', 'Emergency Station Quit', 'Prompts for Master PIN. Closes kiosk and cleanly exits Electron app.', 'High (Master PIN)'],
  ['Alt + Shift + L', 'Emergency Station Lock', 'Prompts for Master PIN. Forces station immediately into locked kiosk mode.', 'High (Master PIN)'],
  ['Alt + Shift + U', 'Emergency Station Unlock', 'Prompts for Master PIN. Unlocks station from locked state for staff testing.', 'High (Master PIN)'],
  ['Right-Click (Timer)', 'Compact Timer Menu', 'Clicking the active compact HUD opens opacity settings (20%-100%) and tray options.', 'Customer Safe'],
  ['Win Key / Win+D / Win+Tab', 'Windows Shell Chords', 'Swallowed by low-level Windows key hook (windows-key-hook.ps1). Prevents task switching.', 'Hardware Blocked'],
  ['Alt+Tab / Alt+F4 / Ctrl+Esc', 'Application Escapes', 'Intercepted & cancelled by Electron before-input-event while station is locked.', 'System Blocked']
];

autoTable(doc, {
  startY: y,
  head: [['Key Combination', 'Action / Trigger', 'Description & Functional Purpose', 'Access Level']],
  body: customerShortcuts,
  margin: { left: margin, right: margin },
  styles: { fontSize: 7.8, cellPadding: 2.2, textColor: [30, 41, 59] },
  headStyles: { fillColor: C_SURFACE, textColor: [255, 255, 255], fontStyle: 'bold' },
  alternateRowStyles: { fillColor: C_BG_CARD },
  columnStyles: {
    0: { cellWidth: 30, fontStyle: 'bold', textColor: C_DARK },
    1: { cellWidth: 38, fontStyle: 'bold' },
    2: { cellWidth: 84 },
    3: { cellWidth: 28, fontStyle: 'bold', textColor: [180, 83, 9] }
  }
});

y = doc.lastAutoTable.finalY + 8;
y = drawSectionHeading(doc, y, '2. Admin Terminal & Management Shortcuts', 'Cashier Console Controls');

const adminShortcuts = [
  ['Alt + Shift + L', 'Instant Privacy Lock', 'Locks Admin Terminal immediately. Requires Admin PIN or Password to unlock.', 'Console Security'],
  ['Alt + Shift + U', 'Focus Unlock Field', 'Bypasses lock input trap to immediately focus the PIN/password box on lock screen.', 'Console Security'],
  ['F8', 'Toggle UI Mode', 'Instantly switches between Simple Mode (Cashier POS) and Advance Mode (Owner).', 'Role Gated'],
  ['F9', 'Toggle Theme Mode', 'Switches between standard Dashboard theme and Esports cyber gaming arena skin.', 'Theme Control'],
  ['Escape', 'Dismiss Active Layer', 'Closes modals, slide-out drawer, mobile nav, or Quick Find popovers (disabled if locked).', 'Navigation'],
  ['Enter (Quick Find)', 'Jump to Top Match', 'In header Quick Find bar, pressing Enter immediately routes to top matched PC or Member.', 'Productivity']
];

autoTable(doc, {
  startY: y,
  head: [['Key / Hotkey', 'Action / Trigger', 'Description & Functional Purpose', 'Category']],
  body: adminShortcuts,
  margin: { left: margin, right: margin },
  styles: { fontSize: 7.8, cellPadding: 2.2, textColor: [30, 41, 59] },
  headStyles: { fillColor: C_SURFACE, textColor: [255, 255, 255], fontStyle: 'bold' },
  alternateRowStyles: { fillColor: C_BG_CARD },
  columnStyles: {
    0: { cellWidth: 32, fontStyle: 'bold', textColor: C_DARK },
    1: { cellWidth: 38, fontStyle: 'bold' },
    2: { cellWidth: 82 },
    3: { cellWidth: 28, fontStyle: 'bold', textColor: [2, 132, 199] }
  }
});

y = doc.lastAutoTable.finalY + 8;
y = drawCallout(doc, y, 'CRITICAL CREDENTIALS & MASTER PINS REFERENCE', [
  '• Station Setup Master PIN (Default: 062321): Protects Server Connection settings, Emergency Quit/Lock/Unlock, and',
  '  Station Launcher configuration. Verified using crypto.timingSafeEqual. Change via AEZAKMI_STATION_SETUP_MASTER_PIN.',
  '• Default Member Password (1234): Assigned to newly created members. System enforces mandatory password update on login.',
  '• Staff Invitation Temporary Password (Staff#XXXX): Random 4-digit code generated during staff onboarding.'
], [180, 83, 9], 26);

// ==========================================
// PAGE 3: STAFF & EMPLOYEE MANAGEMENT
// ==========================================
doc.addPage();
addHeaderFooter(doc, 3, 5, 'VOLUME 1 — STAFF & EMPLOYEE ONBOARDING');

y = 18;
y = drawSectionHeading(doc, y, 'Staff Management & Role Delegation', 'Step-by-Step Operator Guide');

doc.setFont('helvetica', 'normal');
doc.setFontSize(8.2);
doc.setTextColor(51, 65, 85);
const introStaff = 'The iCafe system features multi-tier staff role delegation, allowing cafe owners to grant cashier and supervisor permissions without compromising business revenue reports, rate plan tariffs, or master security credentials.';
doc.text(doc.splitTextToSize(introStaff, contentWidth), margin, y);
y += 10;

const rolesData = [
  ['Cashier / Front-Desk', 'cashier', 'Day-to-day front desk operations, member balance top-ups, walk-in guest passes, food/snack sales, shift reconciliation.', 'Tariffs, system settings, master PINs, employee invitations, financial audits.'],
  ['Shift Manager', 'manager', 'Supervises cashiers, reviews daily shift handovers, handles station overrides, updates inventory stock quantities.', 'System rate pricing, business owner settings, developer console.'],
  ['Branch Admin', 'admin', 'Full store authority: configures hourly rate plans, PC station layouts, invites new employees, manages store settings.', 'Multi-branch owner billing and developer platform configurations.']
];

autoTable(doc, {
  startY: y,
  head: [['Role Name', 'Internal Key', 'Allowed Capabilities & Duties', 'Access Restrictions']],
  body: rolesData,
  margin: { left: margin, right: margin },
  styles: { fontSize: 7.8, cellPadding: 2.5, textColor: [30, 41, 59] },
  headStyles: { fillColor: C_SURFACE, textColor: [255, 255, 255], fontStyle: 'bold' },
  alternateRowStyles: { fillColor: C_BG_CARD },
  columnStyles: {
    0: { cellWidth: 34, fontStyle: 'bold', textColor: C_DARK },
    1: { cellWidth: 22, fontStyle: 'italic', textColor: C_GRAY },
    2: { cellWidth: 68 },
    3: { cellWidth: 56, textColor: [153, 27, 27] }
  }
});

y = doc.lastAutoTable.finalY + 8;
y = drawSectionHeading(doc, y, 'Step-by-Step: Adding an Employee to the System', 'Admin Console Workflow');

const steps = [
  ['Step 1', 'Open Team Settings', 'Sign in as Owner or Admin. Press F8 to enter Advance Mode. Click Settings -> Team & Staff tab.'],
  ['Step 2', 'Fill Employee Details', 'Enter Full Name (e.g. Sarah Jenkins), Email Address (e.g. sarah@icafe.ph), and Assigned Role.'],
  ['Step 3', 'Click Invite Employee', 'System provisions an account in Supabase Auth / Local Edge with must_change_credentials = true.'],
  ['Step 4', 'Credential Delivery', 'If Brevo API is set, an email with credentials is sent. Otherwise, copy the temporary password from the UI.'],
  ['Step 5', 'First Login & Setup', 'Employee logs in using their email and temporary password (Staff#XXXX). Setup modal forces password change.'],
  ['Step 6', 'Fast Terminal Unlock', 'Configure a 4-8 digit Cashier PIN in Settings -> Security & PIN for fast unlock without typing passwords.']
];

autoTable(doc, {
  startY: y,
  head: [['Step', 'Action', 'Operational Instructions & System Behavior']],
  body: steps,
  margin: { left: margin, right: margin },
  styles: { fontSize: 7.8, cellPadding: 2.2, textColor: [30, 41, 59] },
  headStyles: { fillColor: C_SURFACE, textColor: [255, 255, 255], fontStyle: 'bold' },
  alternateRowStyles: { fillColor: C_BG_CARD },
  columnStyles: {
    0: { cellWidth: 18, fontStyle: 'bold', textColor: C_GOLD },
    1: { cellWidth: 40, fontStyle: 'bold' },
    2: { cellWidth: 122 }
  }
});

y = doc.lastAutoTable.finalY + 8;
y = drawCallout(doc, y, 'FIRST LOGIN PASSWORD ENFORCEMENT (SECURITY FEATURE)', [
  '• When any employee logs in with a temporary password (Staff#XXXX), AdminCredentialSetup immediately locks the screen.',
  '• The employee cannot dismiss the dialog with Escape or navigate away until they establish their own confidential password.',
  '• In PIN mode, the cashier establishes a private numeric PIN for fast terminal access during busy gaming hours.'
], [14, 165, 233], 21);

// ==========================================
// PAGE 4: PRODUCTION DEPLOYMENT GUIDE
// ==========================================
doc.addPage();
addHeaderFooter(doc, 4, 5, 'VOLUME 2 — PRODUCTION DEPLOYMENT GUIDE');

y = 18;
y = drawSectionHeading(doc, y, 'Production Rollout & Architecture Roadmap', 'Final Release Gates');

const deploySteps = [
  ['1. Supabase Cloud Deploy', 'Database & Functions', 'Apply all 34 migrations and deploy 16 serverless Edge Functions to your Supabase project.', 'npx supabase db push\nnpx supabase functions deploy --use-api'],
  ['2. Cloud Admin Web Deploy', 'Vercel Deployment', 'Connect GitHub repo to Vercel. Set build command: npm run build:admin and configure public Supabase URL/key.', 'Vercel Dashboard / Git Push'],
  ['3. Customer Station Installer', 'NSIS Packaging (x64)', 'Builds hardened Electron kiosk client into apps/customer/installer. Includes low-level key hook.', 'npm --workspace apps/customer run dist:win'],
  ['4. Admin / Cafe Edge Installer', 'Native Rebuild & NSIS', 'Rebuilds native modules (better-sqlite3, argon2) for Electron ABI and packages desktop server bundle.', 'npm --workspace apps/admin run dist:win'],
  ['5. Server PC LAN Inbound Rule', 'Windows Firewall', 'Allow TCP port 3000 inbound on Server PC so stations can fall back to local Cafe Edge during outages.', 'New-NetFirewallRule -Port 3000 -Action Allow'],
  ['6. Station OTP Pairing', '8-Digit One-Time Code', 'Generate code in Cloud Admin -> Clients -> Pair Station. Enter on customer PC to permanently bind.', 'Code format: XXXX-XXXX']
];

autoTable(doc, {
  startY: y,
  head: [['Stage', 'Target Area', 'Description & Verification', 'Command / Action']],
  body: deploySteps,
  margin: { left: margin, right: margin },
  styles: { fontSize: 7.8, cellPadding: 2.2, textColor: [30, 41, 59] },
  headStyles: { fillColor: C_SURFACE, textColor: [255, 255, 255], fontStyle: 'bold' },
  alternateRowStyles: { fillColor: C_BG_CARD },
  columnStyles: {
    0: { cellWidth: 40, fontStyle: 'bold', textColor: C_DARK },
    1: { cellWidth: 32, fontStyle: 'bold', textColor: C_BLUE },
    2: { cellWidth: 68 },
    3: { cellWidth: 40, fontStyle: 'italic', textColor: [30, 41, 59] }
  }
});

y = doc.lastAutoTable.finalY + 8;
y = drawSectionHeading(doc, y, 'Production Environment Variables Reference', 'Configuration Guardrails');

const envTable = [
  ['JWT_SECRET', 'backend/.env', 'Must be at least 32 characters in production. Backend throws fatal error if default.', 'Required'],
  ['CORS_ORIGIN', 'backend/.env', 'Explicit comma-separated origins (e.g. https://your-admin.vercel.app,http://localhost:5174). No wildcard.', 'Required'],
  ['AEZAKMI_STATION_SETUP_MASTER_PIN', 'Server & Client env', '4-8 digits. Master recovery PIN. Default is 062321. Set custom PIN before deploying.', 'Recommended'],
  ['BREVO_API_KEY', 'Supabase & backend', 'API key for transactional email delivery (quotations, invites, password resets).', 'Optional / Ready'],
  ['AEZAKMI_CLOUD_ENABLED', 'backend/.env', 'Set to true on Cafe Edge server to enable automatic background replication to Supabase.', 'Required']
];

autoTable(doc, {
  startY: y,
  head: [['Variable Name', 'Scope / Target', 'Requirements & Safety Enforcement', 'Status']],
  body: envTable,
  margin: { left: margin, right: margin },
  styles: { fontSize: 7.8, cellPadding: 2.2, textColor: [30, 41, 59] },
  headStyles: { fillColor: C_SURFACE, textColor: [255, 255, 255], fontStyle: 'bold' },
  alternateRowStyles: { fillColor: C_BG_CARD },
  columnStyles: {
    0: { cellWidth: 44, fontStyle: 'bold', textColor: C_DARK },
    1: { cellWidth: 30, fontStyle: 'italic' },
    2: { cellWidth: 81 },
    3: { cellWidth: 25, fontStyle: 'bold', textColor: [180, 83, 9] }
  }
});

y = doc.lastAutoTable.finalY + 8;
y = drawCallout(doc, y, 'AUTOMATED BACKUP & OBSERVABILITY GUARANTEE', [
  '• Database Backups: backend/src/services/databaseBackup.js takes automated verified SQLite backups every 6 hours.',
  '• Retention: Keeps 28 point-in-time snapshots in ./data/backups (7-day full rolling recovery).',
  '• Observability: Local error logs in ./data/logs with automatic sensitive parameter sanitization (passwords/PINs redacted).'
], [16, 185, 129], 21);

// ==========================================
// PAGE 5: DAILY OPERATIONS & SAFETY RULES
// ==========================================
doc.addPage();
addHeaderFooter(doc, 5, 5, 'VOLUME 2 — DAILY OPERATIONS & SAFETY RULES');

y = 18;
y = drawSectionHeading(doc, y, 'Daily Operational Failure Modes & Safety Nets', 'Resilience Matrix');

const opsMatrix = [
  ['ISP Internet Drop', 'Station detects WAN failure and routes requests to local LAN Cafe Edge (port 3000). Active sessions remain active.', 'No action needed. When WAN restores, syncWorker uploads backlog.'],
  ['PC Crash / Power Loss', 'markSessionExit checkpoints remaining seconds into SQLite/Cloud. Station reboots into kiosk mode with time intact.', 'Customer logs back in to resume or cashier clicks Restore Interrupted.'],
  ['Customer Lock / Break', 'Station lock freezes postpaid and prepaid billing timers. Paused duration is excluded from billing.', 'Customer unlocks with password; timer resumes from exact pause checkpoint.'],
  ['Gamer Tamper / Cheat', 'Windows Key hook + Electron kiosk swallow Win+D, Alt+Tab, Alt+F4, Ctrl+Esc, and Task Manager.', 'Only staff with Master PIN (Alt+Shift+W) can exit or minimize the kiosk.'],
  ['Cashier Shift Handover', 'Shift Management modal tallies Cash Top-ups, POS sales, guest passes, and flags drawer variance.', 'Cashier counts drawer cash, enters total, and closes shift report.']
];

autoTable(doc, {
  startY: y,
  head: [['Operational Event', 'Automated System Safety Net', 'Cashier / Staff Action']],
  body: opsMatrix,
  margin: { left: margin, right: margin },
  styles: { fontSize: 7.8, cellPadding: 2.2, textColor: [30, 41, 59] },
  headStyles: { fillColor: C_SURFACE, textColor: [255, 255, 255], fontStyle: 'bold' },
  alternateRowStyles: { fillColor: C_BG_CARD },
  columnStyles: {
    0: { cellWidth: 36, fontStyle: 'bold', textColor: C_DARK },
    1: { cellWidth: 84 },
    2: { cellWidth: 60, fontStyle: 'italic', textColor: [30, 41, 59] }
  }
});

y = doc.lastAutoTable.finalY + 8;
y = drawSectionHeading(doc, y, 'The 4 Golden Rules of Physical Cafe Deployment', 'Must-Follow Setup Rules');

const rules = [
  ['Rule 1: Deep Freeze / Diskless Storage', 'Customer station stores its permanent paired credential in [InstallDir]/.aezakmi-customer right beside the exe. Install Customer Station on an unfrozen partition (e.g. D: drive or persistent game drive), or pair the station in Thawed mode before freezing the golden image.'],
  ['Rule 2: Server PC Static IP', 'The server PC must have a static local IP address (e.g. 192.168.1.100) configured via Windows adapter settings or router DHCP reservation. This ensures client PCs always find the Cafe Edge fallback when internet drops.'],
  ['Rule 3: Antivirus & Defender Whitelisting', 'Add the installation directories to Windows Defender exclusions on client PCs (C:\\Program Files\\iCafe Customer Station) and server (C:\\ProgramData\\iCafe Management System) so the keyboard hook is never blocked.'],
  ['Rule 4: Master PIN Customization', 'Never leave the default Master PIN (062321) on public client stations. Set your own private 6-digit PIN in AEZAKMI_STATION_SETUP_MASTER_PIN on both server and clients.']
];

autoTable(doc, {
  startY: y,
  head: [['Rule', 'Detailed Instructions & Safeguards']],
  body: rules,
  margin: { left: margin, right: margin },
  styles: { fontSize: 7.8, cellPadding: 2.2, textColor: [30, 41, 59] },
  headStyles: { fillColor: C_SURFACE, textColor: [255, 255, 255], fontStyle: 'bold' },
  alternateRowStyles: { fillColor: C_BG_CARD },
  columnStyles: {
    0: { cellWidth: 48, fontStyle: 'bold', textColor: [180, 83, 9] },
    1: { cellWidth: 132 }
  }
});

y = doc.lastAutoTable.finalY + 6;
y = drawCallout(doc, y, 'EMERGENCY RECOVERY CHEAT SHEET', [
  '• Customer Station Stuck / Kiosk Escape: Press Alt + Shift + W and enter Master PIN (062321 or custom).',
  '• Unpair / Re-pair Station: Click "Server" on Customer login screen -> Master PIN -> Server Connection -> Reset Pairing.',
  '• Admin Console Locked: Press Alt + Shift + U to focus unlock box, then enter Admin PIN or Password.'
], [220, 38, 38], 21);

// Save PDF to disk
const outputDir = path.join(__dirname, '..', 'docs');
fs.mkdirSync(outputDir, { recursive: true });
const targetFile = path.join(outputDir, 'iCafe_Operations_and_Staff_Manual.pdf');
const pdfBytes = Buffer.from(doc.output('arraybuffer'));
fs.writeFileSync(targetFile, pdfBytes);

console.log('PDF manual generated successfully at: ' + targetFile);
console.log('Size: ' + (pdfBytes.length / 1024).toFixed(1) + ' KB, Pages: ' + doc.internal.getNumberOfPages());
