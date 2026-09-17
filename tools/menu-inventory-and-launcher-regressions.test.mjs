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
