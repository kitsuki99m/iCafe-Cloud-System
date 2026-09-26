import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')

test('backend apiRoutes implements menu stock quantity validations, decrement, and cancellation restoration', () => {
  const apiRoutesPath = path.join(repoRoot, 'backend', 'src', 'routes', 'apiRoutes.js')
  const content = fs.readFileSync(apiRoutesPath, 'utf8')

  // Stock check before ordering
  assert.ok(content.includes('stock_quantity !== null'), 'apiRoutes must validate stock_quantity before order placement')
  assert.ok(content.includes('MAX(0, stock_quantity - ?)'), 'apiRoutes must decrement stock_quantity on order placement')
  assert.ok(content.includes('stock_quantity = stock_quantity + ?'), 'apiRoutes must restore stock_quantity on order cancellation')
  assert.ok(content.includes("emitDataChanged({ entity: 'menu_items' })"), 'apiRoutes must emit menu_items data changes on order mutations')
})

test('admin cloudClient and AppDataContext include launcher, menu, shift, and voucher data mapping', () => {
  const cloudClientPath = path.join(repoRoot, 'apps', 'admin', 'src', 'lib', 'cloudClient.js')
  const appDataContextPath = path.join(repoRoot, 'apps', 'admin', 'src', 'context', 'AppDataContext.jsx')
  const cloudClientContent = fs.readFileSync(cloudClientPath, 'utf8')
  const appDataContextContent = fs.readFileSync(appDataContextPath, 'utf8')

  assert.ok(cloudClientContent.includes('branch_launcher_categories'), 'cloudClient must query branch_launcher_categories')
  assert.ok(cloudClientContent.includes('branch_launcher_apps'), 'cloudClient must query branch_launcher_apps')
  assert.ok(cloudClientContent.includes('branch_menu_items'), 'cloudClient must query branch_menu_items')
  assert.ok(cloudClientContent.includes('branch_menu_orders'), 'cloudClient must query branch_menu_orders')

  assert.ok(appDataContextContent.includes('launcherCategories:data.launcherCategories') || appDataContextContent.includes('launcherCategories,'), 'AppDataContext must map launcherCategories')
  assert.ok(appDataContextContent.includes('launcherApps:data.launcherApps') || appDataContextContent.includes('launcherApps,'), 'AppDataContext must map launcherApps')
})

test('admin MenuManagementPage renders stock quantity field and out-of-stock indicators', () => {
  const menuPagePath = path.join(repoRoot, 'apps', 'admin', 'src', 'pages', 'MenuManagementPage.jsx')
  const content = fs.readFileSync(menuPagePath, 'utf8')

  assert.ok(content.includes('stockQuantity'), 'MenuManagementPage must track stockQuantity state')
  assert.ok(content.includes('Stock Quantity'), 'MenuManagementPage must provide Stock Quantity input')
  assert.ok(content.includes('Low Stock:'), 'MenuManagementPage must display Low Stock indicator')
})

test('customer MenuOrderModal enforces stock limits and displays stock warnings', () => {
  const customerModalPath = path.join(repoRoot, 'apps', 'customer', 'src', 'components', 'customer', 'MenuOrderModal.jsx')
  const content = fs.readFileSync(customerModalPath, 'utf8')

  assert.ok(content.includes('Stock Limit Reached'), 'MenuOrderModal must prevent adding more items than available in stock')
  assert.ok(content.includes('Only '), 'MenuOrderModal must display low stock indicator')
  assert.ok(content.includes('Out of Stock'), 'MenuOrderModal must display out-of-stock badge and disable button')
})

test('backend apiRoutes and AppDataContext support batch menu items creation', () => {
  const apiRoutesPath = path.join(repoRoot, 'backend', 'src', 'routes', 'apiRoutes.js')
  const appDataContextPath = path.join(repoRoot, 'apps', 'admin', 'src', 'context', 'AppDataContext.jsx')
  const apiContent = fs.readFileSync(apiRoutesPath, 'utf8')
  const appCtxContent = fs.readFileSync(appDataContextPath, 'utf8')

  assert.ok(apiContent.includes('/menu-items/batch'), 'apiRoutes must expose POST /menu-items/batch route')
  assert.ok(appCtxContent.includes('batchCreateMenuItems'), 'AppDataContext must expose batchCreateMenuItems')
})

test('philippineMenuPresets and generated WebP assets exist and cover all requested Philippine categories', async () => {
  const { PHILIPPINE_MENU_CATALOG, PHILIPPINE_MENU_CATEGORIES } = await import('../apps/admin/src/data/philippineMenuPresets.js')

  assert.ok(PHILIPPINE_MENU_CATALOG.length >= 50, 'Catalog must contain comprehensive Philippine items')
  assert.ok(PHILIPPINE_MENU_CATEGORIES.includes('Beverages & Drinks'), 'Catalog must include Beverages & Drinks category')
  assert.ok(PHILIPPINE_MENU_CATEGORIES.includes('Chips, Nuts & Savory Snacks'), 'Catalog must include Chips, Nuts & Savory Snacks category')
  assert.ok(PHILIPPINE_MENU_CATEGORIES.includes('Biscuits, Chocolates & Sweets'), 'Catalog must include Biscuits, Chocolates & Sweets category')
  assert.ok(PHILIPPINE_MENU_CATEGORIES.includes('Noodles & Quick Meals'), 'Catalog must include Noodles & Quick Meals category')

  // Verify public assets/menu directory exists
  const adminMenuAssets = path.join(repoRoot, 'apps', 'admin', 'public', 'assets', 'menu')
  const customerMenuAssets = path.join(repoRoot, 'apps', 'customer', 'public', 'assets', 'menu')

  assert.ok(fs.existsSync(adminMenuAssets), 'Admin public assets/menu directory must exist')
  assert.ok(fs.existsSync(customerMenuAssets), 'Customer public assets/menu directory must exist')
})

test('cancelled menu orders are removed from database and filtered out from live orders', () => {
  const apiRoutesPath = path.join(repoRoot, 'backend', 'src', 'routes', 'apiRoutes.js')
  const apiContent = fs.readFileSync(apiRoutesPath, 'utf8')

  assert.ok(apiContent.includes("DELETE FROM menu_orders WHERE id=?"), 'apiRoutes must delete cancelled orders from menu_orders table')
  assert.ok(apiContent.includes("DELETE FROM revenue_events WHERE source_type='menu_order' AND source_id=?"), 'apiRoutes must delete revenue events for cancelled orders')
  assert.ok(apiContent.includes("order_status != 'cancelled'"), 'GET /menu-orders must exclude cancelled orders from list')

  const customerAppCtxPath = path.join(repoRoot, 'apps', 'customer', 'src', 'context', 'AppDataContext.jsx')
  const customerAppCtx = fs.readFileSync(customerAppCtxPath, 'utf8')
  assert.ok(customerAppCtx.includes("myOrders: (current.myOrders || []).filter((o) => String(o.id) !== String(orderId))"), 'cancelMyOrder must remove order from customer list')

  const adminPagePath = path.join(repoRoot, 'apps', 'admin', 'src', 'pages', 'MenuManagementPage.jsx')
  const adminPage = fs.readFileSync(adminPagePath, 'utf8')
  assert.ok(adminPage.includes("liveOrders = useMemo"), 'Admin MenuManagementPage must filter liveOrders to exclude cancelled orders')
})

test('customer auth and lifecycle recovery guards active logged in member from being wiped out after crash/forfeit', () => {
  const authCtxPath = path.join(repoRoot, 'apps', 'customer', 'src', 'context', 'AuthContext.jsx')
  const authCtx = fs.readFileSync(authCtxPath, 'utf8')

  assert.ok(authCtx.includes("if (getToken() || user) return"), 'AuthContext recovery loop must guard against wiping active user state')
  assert.ok(authCtx.includes("clearAdminSessionCloseFence()"), 'loginCustomerCredentials must clear admin session close fence')
  assert.ok(authCtx.includes("clearStationLifecycleMarker()"), 'loginCustomerCredentials must clear station lifecycle marker')

  const apiRoutesPath = path.join(repoRoot, 'backend', 'src', 'routes', 'apiRoutes.js')
  const apiContent = fs.readFileSync(apiRoutesPath, 'utf8')
  assert.ok(apiContent.includes("created_at <= ? AND revoked_at IS NULL"), 'apiRoutes lifecycle must not revoke fresh auth sessions created after crash interruption')
})
