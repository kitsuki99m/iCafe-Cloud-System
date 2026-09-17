import { useState, useMemo } from 'react'
import {
  UtensilsCrossed,
  ShoppingBag,
  Plus,
  Pencil,
  Trash2,
  Clock3,
  CheckCircle2,
  Pizza,
  Search,
} from 'lucide-react'
import { useAppData } from '../context/AppDataContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { showToast } from '../lib/toast.js'
import Button from '../components/common/Button.jsx'
import Modal from '../components/common/Modal.jsx'
import ConfirmModal from '../components/common/ConfirmModal.jsx'
import NumericInput from '../components/common/NumericInput.jsx'
import { AdminEmptyState, AdminMetricCard, AdminPageWorkspace, AdminRailCard } from '../components/layout/AdminPageWorkspace.jsx'

const CATEGORIES = ['All', 'Food', 'Drinks', 'Snacks', 'Combos']
const inputClass = 'w-full rounded-xl border border-surface-line customer-neutral-surface px-3 py-2 text-sm text-ink-900 focus:outline-none focus:border-gold/50'

export default function MenuManagementPage() {
  const { menuItems, menuOrders, createMenuItem, updateMenuItem, deleteMenuItem, updateOrderStatus, cancelMenuOrder } = useAppData()
  const { user } = useAuth()
  const isCashier = user?.role === 'cashier'
  const [activeTab, setActiveTab] = useState('orders') // 'orders' | 'items'
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [deleteTargetItem, setDeleteTargetItem] = useState(null)
  const [cancelTargetOrderId, setCancelTargetOrderId] = useState(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    category: 'Food',
    price: '',
    description: '',
    imageUrl: '',
    isAvailable: true,
  })
  const [submitting, setSubmitting] = useState(false)

  const pendingOrders = useMemo(() => {
    return menuOrders.filter((o) => (o.order_status || o.orderStatus) === 'pending')
  }, [menuOrders])

  const preparingOrders = useMemo(() => {
    return menuOrders.filter((o) => (o.order_status || o.orderStatus) === 'preparing')
  }, [menuOrders])

  const fulfilledOrders = useMemo(() => {
    return menuOrders.filter((o) => (o.order_status || o.orderStatus) === 'fulfilled')
  }, [menuOrders])

  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
      const matchCat = selectedCategory === 'All' || item.category?.toLowerCase() === selectedCategory.toLowerCase()
      const matchSearch = !searchQuery.trim() || item.name?.toLowerCase().includes(searchQuery.toLowerCase())
      return matchCat && matchSearch
    })
  }, [menuItems, selectedCategory, searchQuery])

  function openCreateModal() {
    setEditingItem(null)
    setFormData({ name: '', category: 'Food', price: '', description: '', imageUrl: '', isAvailable: true })
    setModalOpen(true)
  }

  function openEditModal(item) {
    setEditingItem(item)
    setFormData({
      name: item.name,
      category: item.category || 'Food',
      price: item.price,
      description: item.description || '',
      imageUrl: item.image_url || item.imageUrl || '',
      isAvailable: item.is_available !== undefined ? Boolean(item.is_available) : Boolean(item.isAvailable),
    })
    setModalOpen(true)
  }

  async function handleSaveItem(e) {
    if (e && e.preventDefault) e.preventDefault()
    setSubmitting(true)
    try {
      if (editingItem) {
        await updateMenuItem(editingItem.id, {
          name: formData.name.trim(),
          category: formData.category,
          price: Number(formData.price),
          description: formData.description.trim(),
          imageUrl: formData.imageUrl.trim(),
          isAvailable: formData.isAvailable,
        })
        showToast({ title: 'Item Updated', message: formData.name })
      } else {
        await createMenuItem({
          name: formData.name.trim(),
          category: formData.category,
          price: Number(formData.price),
          description: formData.description.trim(),
          imageUrl: formData.imageUrl.trim(),
          isAvailable: formData.isAvailable,
        })
        showToast({ title: 'Item Created', message: formData.name })
      }
      setModalOpen(false)
    } catch (err) {
      showToast({ title: 'Failed to save item', message: err.message, tone: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  function promptDeleteItem(item) {
    if (isCashier) {
      showToast({ title: 'Restricted Action', message: 'Cashiers cannot delete menu items.', tone: 'error' })
      return
    }
    setDeleteTargetItem(item)
  }

  async function confirmDeleteItem() {
    if (!deleteTargetItem) return
    setActionBusy(true)
    try {
      await deleteMenuItem(deleteTargetItem.id)
      showToast({ title: 'Item Deleted', message: deleteTargetItem.name, tone: 'warning' })
      setDeleteTargetItem(null)
    } catch (err) {
      showToast({ title: 'Delete Failed', message: err.message, tone: 'error' })
    } finally {
      setActionBusy(false)
    }
  }

  async function handleStatusChange(orderId, nextStatus) {
    try {
      await updateOrderStatus(orderId, nextStatus)
      showToast({ title: 'Order Status Updated', message: `Marked as ${nextStatus}` })
    } catch (err) {
      showToast({ title: 'Update Failed', message: err.message, tone: 'error' })
    }
  }

  function promptCancelOrder(orderId) {
    setCancelTargetOrderId(orderId)
  }

  async function confirmCancelOrder() {
    if (!cancelTargetOrderId) return
    setActionBusy(true)
    try {
      await cancelMenuOrder(cancelTargetOrderId)
      showToast({ title: 'Order Cancelled', message: 'Order was cancelled and refunded if applicable.', tone: 'warning' })
      setCancelTargetOrderId(null)
    } catch (err) {
      showToast({ title: 'Cancel Failed', message: err.message, tone: 'error' })
    } finally {
      setActionBusy(false)
    }
  }

  return (
    <AdminPageWorkspace
      aside={
        <>
          <AdminRailCard title="Kitchen Quick Stats">
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-xl border border-surface-line customer-neutral-surface p-3 text-xs">
                <span className="text-slate-soft">Pending Orders</span>
                <span className="font-semibold text-gold-dim stat-figure text-sm">{pendingOrders.length}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-surface-line customer-neutral-surface p-3 text-xs">
                <span className="text-slate-soft">Preparing</span>
                <span className="font-semibold text-teal-dim stat-figure text-sm">{preparingOrders.length}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-surface-line customer-neutral-surface p-3 text-xs">
                <span className="text-slate-soft">Menu Items Active</span>
                <span className="font-semibold text-ink-900 stat-figure text-sm">
                  {menuItems.filter((i) => i.is_available !== false && i.isAvailable !== false).length}
                </span>
              </div>
            </div>
          </AdminRailCard>

          <AdminRailCard title="Fulfillment Guide">
            <p className="text-xs leading-5 text-slate-soft">
              Orders placed by customers appear in the queue instantly. When an order is preparing or fulfilled, the customer station receives real-time progress notifications.
            </p>
          </AdminRailCard>
        </>
      }
    >
      <div className="space-y-5">
        {/* Page Topbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-[20px] font-bold tracking-tight text-ink-900 flex items-center gap-2.5">
              <UtensilsCrossed className="w-5 h-5 text-gold-dim" />
              Food & Beverage Management
            </h1>
            <p className="text-xs text-slate-soft mt-0.5">
              Live in-session customer orders, kitchen fulfillment, and menu item pricing.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-xl border border-surface-line bg-surface-raised p-1">
              <button
                type="button"
                onClick={() => setActiveTab('orders')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  activeTab === 'orders'
                    ? 'bg-surface text-ink-900 shadow-sm'
                    : 'text-slate-soft hover:text-ink-900'
                }`}
              >
                <ShoppingBag size={14} /> Live Orders
                {pendingOrders.length > 0 && (
                  <span className="rounded-full bg-ember/15 text-ember-dim px-1.5 py-0.2 text-[10px] font-bold">
                    {pendingOrders.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('items')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  activeTab === 'items'
                    ? 'bg-surface text-ink-900 shadow-sm'
                    : 'text-slate-soft hover:text-ink-900'
                }`}
              >
                <Pizza size={14} /> Menu Catalog ({menuItems.length})
              </button>
            </div>

            {activeTab === 'items' && !isCashier && (
              <Button variant="primary" icon={Plus} onClick={openCreateModal}>
                Add Item
              </Button>
            )}
          </div>
        </div>

        {/* Metrics Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <AdminMetricCard
            label="Pending Orders"
            value={pendingOrders.length}
            icon={ShoppingBag}
            tone={pendingOrders.length > 0 ? 'warning' : 'neutral'}
            onClick={() => setActiveTab('orders')}
          />
          <AdminMetricCard
            label="Preparing"
            value={preparingOrders.length}
            icon={Clock3}
            tone={preparingOrders.length > 0 ? 'success' : 'neutral'}
            onClick={() => setActiveTab('orders')}
          />
          <AdminMetricCard
            label="Fulfilled Today"
            value={fulfilledOrders.length}
            icon={CheckCircle2}
            tone="neutral"
            onClick={() => setActiveTab('orders')}
          />
          <AdminMetricCard
            label="Catalog Items"
            value={menuItems.length}
            icon={UtensilsCrossed}
            tone="neutral"
            onClick={() => setActiveTab('items')}
          />
        </div>

        {/* ORDERS TAB */}
        {activeTab === 'orders' && (
          <div className="space-y-4">
            {menuOrders.length === 0 ? (
              <AdminEmptyState
                icon={ShoppingBag}
                title="No Customer Orders Yet"
                description="Orders placed by customers from their stations will appear here in real-time."
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {menuOrders.map((order) => {
                  const status = order.order_status || order.orderStatus || 'pending'
                  const isPending = status === 'pending'
                  const isPreparing = status === 'preparing'
                  const isFulfilled = status === 'fulfilled'
                  const isCancelled = status === 'cancelled'
                  const items = typeof order.items === 'string' ? JSON.parse(order.items || '[]') : order.items || []

                  return (
                    <div
                      key={order.id}
                      className={`rounded-2xl border p-4 transition flex flex-col justify-between ${
                        isPending
                          ? 'border-gold/30 bg-gold/5'
                          : isPreparing
                          ? 'border-teal/30 bg-teal/5'
                          : isFulfilled
                          ? 'border-surface-line customer-neutral-surface'
                          : 'border-surface-line bg-surface-raised/40 opacity-60'
                      }`}
                    >
                      <div>
                        {/* Header */}
                        <div className="flex items-center justify-between pb-3 border-b border-surface-line">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs text-ink-900 px-2 py-0.5 rounded-lg bg-surface border border-surface-line">
                              {order.pc_label || order.pcLabel || 'Station'}
                            </span>
                            <span className="text-xs text-slate-soft font-medium truncate max-w-[140px]">
                              {order.customer_name || order.customerName || 'Customer'}
                            </span>
                          </div>
                          <span
                            className={`text-[10px] px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wider ${
                              isPending
                                ? 'bg-gold/15 text-gold-dim border border-gold/30'
                                : isPreparing
                                ? 'bg-teal/15 text-teal-dim border border-teal/30'
                                : isFulfilled
                                ? 'bg-surface-raised text-slate-soft border border-surface-line'
                                : 'bg-ember/15 text-ember-dim border border-ember/30'
                            }`}
                          >
                            {status}
                          </span>
                        </div>

                        {/* Items */}
                        <div className="py-3 space-y-1.5">
                          {items.map((it, idx) => (
                            <div key={idx} className="flex items-center justify-between text-xs">
                              <span className="text-ink-900">
                                <strong className="text-gold-dim">{it.quantity}x</strong> {it.name}
                              </span>
                              <span className="text-slate-soft font-mono">
                                ₱{(Number(it.price || 0) * Number(it.quantity || 1)).toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Footer */}
                      <div className="pt-3 border-t border-surface-line space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-soft">
                            Payment: <strong className="text-ink-900 capitalize">{order.payment_method || order.paymentMethod || 'cash'}</strong>
                          </span>
                          <span className="text-sm font-bold text-ink-900 stat-figure">
                            ₱{Number(order.total || 0).toFixed(2)}
                          </span>
                        </div>

                        {!isFulfilled && !isCancelled && (
                          <div className="flex items-center gap-2 pt-1">
                            {isPending && (
                              <Button
                                variant="teal"
                                size="sm"
                                className="flex-1"
                                onClick={() => handleStatusChange(order.id, 'preparing')}
                              >
                                Prepare
                              </Button>
                            )}
                            {isPreparing && (
                              <Button
                                variant="primary"
                                size="sm"
                                className="flex-1"
                                onClick={() => handleStatusChange(order.id, 'fulfilled')}
                              >
                                Fulfill & Serve
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => promptCancelOrder(order.id)}
                            >
                              Cancel
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* MENU CATALOG TAB */}
        {activeTab === 'items' && (
          <div className="space-y-4">
            {/* Toolbar: Category Chips & Search */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1 rounded-xl text-xs font-semibold transition ${
                      selectedCategory === cat
                        ? 'bg-gold/15 text-gold-dim border border-gold/30'
                        : 'border border-surface-line customer-neutral-surface text-slate-soft hover:text-ink-900'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-soft absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search items…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-surface-line customer-neutral-surface pl-8 pr-3 py-1.5 text-xs text-ink-900 focus:outline-none focus:border-gold/50"
                />
              </div>
            </div>

            {filteredItems.length === 0 ? (
              <AdminEmptyState
                icon={UtensilsCrossed}
                title="No Menu Items Found"
                description="Add food and beverage items to start selling to customers in-session."
                action={!isCashier ? <Button variant="primary" icon={Plus} onClick={openCreateModal}>Add Menu Item</Button> : null}
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {filteredItems.map((item) => {
                  const isAvail = item.is_available !== undefined ? Boolean(item.is_available) : Boolean(item.isAvailable)
                  return (
                    <div
                      key={item.id}
                      className={`rounded-2xl border border-surface-line customer-neutral-surface overflow-hidden flex flex-col justify-between transition hover:border-gold/40 ${
                        !isAvail ? 'opacity-60' : ''
                      }`}
                    >
                      <div>
                        {/* Image */}
                        <div className="h-32 bg-surface-raised relative overflow-hidden flex items-center justify-center">
                          {item.image_url || item.imageUrl ? (
                            <img
                              src={item.image_url || item.imageUrl}
                              alt={item.name}
                              className="w-full h-full object-cover"
                              onError={(e) => { e.target.style.display = 'none' }}
                            />
                          ) : (
                            <UtensilsCrossed className="w-8 h-8 text-slate-soft/50" />
                          )}
                          <span className="absolute top-2 right-2 text-[9px] font-semibold uppercase px-2 py-0.5 rounded-full bg-surface/90 backdrop-blur-xs text-ink-900 border border-surface-line">
                            {item.category || 'Food'}
                          </span>
                          {!isAvail && (
                            <div className="absolute inset-0 bg-surface/80 backdrop-blur-2xs flex items-center justify-center">
                              <span className="text-[10px] font-semibold text-ember-dim px-2.5 py-0.5 bg-ember/15 rounded-full border border-ember/25">
                                Out of Stock
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="p-3.5">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="font-semibold text-xs text-ink-900 leading-snug">{item.name}</h4>
                            <span className="font-bold text-xs text-gold-dim stat-figure">
                              ₱{Number(item.price || 0).toFixed(2)}
                            </span>
                          </div>
                          {item.description && (
                            <p className="text-[11px] text-slate-soft mt-1 line-clamp-2">{item.description}</p>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="p-3 pt-0 flex items-center justify-end gap-1.5 border-t border-surface-line/50 mt-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(item)}
                          className="p-1.5 rounded-lg text-slate-soft hover:text-ink-900 hover:bg-dance/35 transition"
                          title="Edit Item"
                        >
                          <Pencil size={13} />
                        </button>
                        {!isCashier && (
                          <button
                            type="button"
                            onClick={() => promptDeleteItem(item)}
                            className="p-1.5 rounded-lg text-slate-soft hover:text-ember-dim hover:bg-ember/10 transition"
                            title="Delete Item"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* CREATE / EDIT MODAL */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        eyebrow="Menu catalog"
        title={editingItem ? 'Edit Menu Item' : 'Add New Menu Item'}
        description="Configure product details, category, pricing, and stock availability."
        maxWidth="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSaveItem} disabled={submitting || !formData.name.trim() || !(Number(formData.price) > 0)}>
              {submitting ? 'Saving…' : 'Save Item'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSaveItem} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="eyebrow mb-1.5 block">Item Name <span className="text-ember-dim">*</span></label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Pancit Canton"
                className={inputClass}
              />
            </div>
            <div>
              <label className="eyebrow mb-1.5 block">Category</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className={inputClass}
              >
                <option value="Food">Food</option>
                <option value="Drinks">Drinks</option>
                <option value="Snacks">Snacks</option>
                <option value="Combos">Combos</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="eyebrow mb-1.5 block">Price (₱) <span className="text-ember-dim">*</span></label>
              <NumericInput
                min="0"
                step="0.01"
                required
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                placeholder="25.00"
                className={inputClass}
              />
            </div>
            <div className="flex items-center pt-5">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-ink-900">
                <input
                  type="checkbox"
                  checked={formData.isAvailable}
                  onChange={(e) => setFormData({ ...formData, isAvailable: e.target.checked })}
                  className="rounded border-surface-line text-gold-dim focus:ring-0"
                />
                In Stock & Available
              </label>
            </div>
          </div>

          <div>
            <label className="eyebrow mb-1.5 block">Photo / Image URL</label>
            <input
              type="url"
              value={formData.imageUrl}
              onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
              placeholder="https://..."
              className={inputClass}
            />
          </div>

          <div>
            <label className="eyebrow mb-1.5 block">Description</label>
            <textarea
              rows={2}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Flavors, serving size, or details…"
              className={`${inputClass} resize-none`}
            />
          </div>
        </form>
      </Modal>

      {/* DELETE ITEM CONFIRMATION */}
      <ConfirmModal
        open={Boolean(deleteTargetItem)}
        title="Delete Menu Item"
        description={`Are you sure you want to delete "${deleteTargetItem?.name}"? This action cannot be undone.`}
        confirmLabel={actionBusy ? 'Deleting…' : 'Delete Item'}
        confirmTone="danger"
        disabled={actionBusy}
        onConfirm={confirmDeleteItem}
        onClose={() => setDeleteTargetItem(null)}
      />

      {/* CANCEL ORDER CONFIRMATION */}
      <ConfirmModal
        open={Boolean(cancelTargetOrderId)}
        title="Cancel Customer Order"
        description="Are you sure you want to cancel this order? If paid via wallet balance, the customer will be automatically refunded."
        confirmLabel={actionBusy ? 'Cancelling…' : 'Cancel Order'}
        confirmTone="danger"
        disabled={actionBusy}
        onConfirm={confirmCancelOrder}
        onClose={() => setCancelTargetOrderId(null)}
      />
    </AdminPageWorkspace>
  )
}
