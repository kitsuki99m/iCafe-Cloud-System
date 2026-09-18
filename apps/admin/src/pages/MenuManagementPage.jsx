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
  Layers,
  Sparkles,
  CheckSquare,
  Square,
  X,
  SlidersHorizontal,
  ArrowRight,
  ArrowLeft,
  Upload,
  Camera,
} from 'lucide-react'
import { useAppData } from '../context/AppDataContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { showToast } from '../lib/toast.js'
import Button from '../components/common/Button.jsx'
import Modal from '../components/common/Modal.jsx'
import ConfirmModal from '../components/common/ConfirmModal.jsx'
import NumericInput from '../components/common/NumericInput.jsx'
import { AdminEmptyState, AdminMetricCard, AdminPageWorkspace, AdminRailCard } from '../components/layout/AdminPageWorkspace.jsx'
import { PHILIPPINE_MENU_CATALOG, PHILIPPINE_MENU_CATEGORIES } from '../data/philippineMenuPresets.js'

const CATEGORIES = ['All', 'Food', 'Drinks', 'Snacks', 'Combos']
const inputClass = 'w-full rounded-xl border border-surface-line customer-neutral-surface px-3 py-2 text-sm text-ink-900 focus:outline-none focus:border-gold/50'

export default function MenuManagementPage() {
  const { menuItems, menuOrders, createMenuItem, batchCreateMenuItems, updateMenuItem, deleteMenuItem, updateOrderStatus, cancelMenuOrder } = useAppData()
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
    stockQuantity: '',
    isAvailable: true,
  })
  const [submitting, setSubmitting] = useState(false)

  // Batch Add / Presets State
  const [batchModalOpen, setBatchModalOpen] = useState(false)
  const [batchStep, setBatchStep] = useState('catalog') // 'catalog' | 'configure'
  const [selectedPresetIds, setSelectedPresetIds] = useState(new Set())
  const [presetCategory, setPresetCategory] = useState('All')
  const [presetSearch, setPresetSearch] = useState('')
  const [batchRows, setBatchRows] = useState([])
  const [batchSubmitting, setBatchSubmitting] = useState(false)

  const filteredPresets = useMemo(() => {
    return PHILIPPINE_MENU_CATALOG.filter((item) => {
      const matchCat = presetCategory === 'All' || item.subcategory === presetCategory || item.category === presetCategory
      const q = presetSearch.toLowerCase().trim()
      const matchSearch = !q || item.name.toLowerCase().includes(q) || (item.subcategory && item.subcategory.toLowerCase().includes(q))
      return matchCat && matchSearch
    })
  }, [presetCategory, presetSearch])

  function openBatchModal() {
    setSelectedPresetIds(new Set())
    setPresetCategory('All')
    setPresetSearch('')
    setBatchRows([])
    setBatchStep('catalog')
    setBatchModalOpen(true)
  }

  function togglePreset(id) {
    setSelectedPresetIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllFilteredPresets() {
    setSelectedPresetIds((prev) => {
      const next = new Set(prev)
      filteredPresets.forEach((p) => next.add(p.id))
      return next
    })
  }

  function deselectAllPresets() {
    setSelectedPresetIds(new Set())
  }

  function proceedToConfigure() {
    if (selectedPresetIds.size === 0) return
    const rows = PHILIPPINE_MENU_CATALOG.filter((p) => selectedPresetIds.has(p.id)).map((p) => ({
      name: p.name,
      category: p.category,
      subcategory: p.subcategory,
      price: String(p.price),
      stockQuantity: p.stockQuantity != null ? String(p.stockQuantity) : '',
      imageUrl: p.imageUrl,
      description: '',
      isAvailable: true,
    }))
    setBatchRows(rows)
    setBatchStep('configure')
  }

  function addCustomBatchRow() {
    setBatchRows((prev) => [
      ...prev,
      {
        name: '',
        category: 'Food',
        subcategory: 'Custom',
        price: '25.00',
        stockQuantity: '20',
        imageUrl: '',
        description: '',
        isAvailable: true,
      },
    ])
  }

  function updateBatchRow(idx, field, val) {
    setBatchRows((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: val }
      return next
    })
  }

  function removeBatchRow(idx) {
    setBatchRows((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleSaveBatch() {
    const validRows = batchRows.filter((r) => r.name && r.name.trim())
    if (validRows.length === 0) {
      showToast({ title: 'Validation Error', message: 'Please provide at least one valid item name.', tone: 'error' })
      return
    }

    setBatchSubmitting(true)
    try {
      const payload = validRows.map((r) => ({
        name: r.name.trim(),
        category: r.category || 'Food',
        price: Math.max(0, Number(r.price) || 0),
        stockQuantity: r.stockQuantity === '' || r.stockQuantity === null || r.stockQuantity === undefined ? null : Math.max(0, parseInt(r.stockQuantity, 10) || 0),
        imageUrl: r.imageUrl ? r.imageUrl.trim() : '',
        description: r.description ? r.description.trim() : '',
        isAvailable: r.isAvailable !== false,
      }))

      await batchCreateMenuItems(payload)
      showToast({ title: 'Batch Added', message: `Successfully added ${validRows.length} items to the menu!`, tone: 'success' })
      setBatchModalOpen(false)
    } catch (err) {
      showToast({ title: 'Batch Add Failed', message: err.message, tone: 'error' })
    } finally {
      setBatchSubmitting(false)
    }
  }

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
    setFormData({ name: '', category: 'Food', price: '', description: '', imageUrl: '', stockQuantity: '', isAvailable: true })
    setModalOpen(true)
  }

  function openEditModal(item) {
    setEditingItem(item)
    const stock = item.stock_quantity !== undefined ? item.stock_quantity : item.stockQuantity
    setFormData({
      name: item.name,
      category: item.category || 'Food',
      price: item.price,
      description: item.description || '',
      imageUrl: item.image_url || item.imageUrl || '',
      stockQuantity: stock != null ? String(stock) : '',
      isAvailable: item.is_available !== undefined ? Boolean(item.is_available) : Boolean(item.isAvailable),
    })
    setModalOpen(true)
  }

  function handleImageFileUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2.5 * 1024 * 1024) {
      showToast({ title: 'File Too Large', message: 'Image file size must be less than 2.5MB.', tone: 'error' })
      return
    }
    const reader = new FileReader()
    reader.onload = (event) => {
      setFormData((prev) => ({ ...prev, imageUrl: event.target.result }))
      showToast({ title: 'Photo Selected', message: 'Image loaded into preview. Click Save to apply.' })
    }
    reader.readAsDataURL(file)
  }

  async function handleSaveItem(e) {
    if (e && e.preventDefault) e.preventDefault()
    setSubmitting(true)
    try {
      const stockQty = formData.stockQuantity === '' || formData.stockQuantity === null || formData.stockQuantity === undefined
        ? null
        : Math.max(0, parseInt(formData.stockQuantity, 10) || 0)
      const payload = {
        name: formData.name.trim(),
        category: formData.category,
        price: Number(formData.price),
        description: formData.description.trim(),
        imageUrl: formData.imageUrl.trim(),
        stockQuantity: stockQty,
        isAvailable: formData.isAvailable,
      }
      if (editingItem) {
        await updateMenuItem(editingItem.id, payload)
        showToast({ title: 'Item Updated', message: formData.name })
      } else {
        await createMenuItem(payload)
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
              <div className="flex items-center justify-between rounded-xl border border-surface-line customer-neutral-surface p-3 text-xs">
                <span className="text-slate-soft">Low / Out of Stock</span>
                <span className="font-semibold text-ember-dim stat-figure text-sm">
                  {menuItems.filter((i) => {
                    const s = i.stock_quantity !== undefined ? i.stock_quantity : i.stockQuantity
                    return s !== null && s !== undefined && Number(s) <= 5
                  }).length}
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
      <div className="space-y-4">
        {/* Page Topbar with Tab Switcher */}
        <div className="flex items-center justify-between gap-3 overflow-x-auto pb-1">
          <div className="inline-flex max-w-full overflow-x-auto rounded-xl border border-surface-line bg-surface-raised p-1 shadow-2xs shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('orders')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                activeTab === 'orders'
                  ? 'bg-surface text-ink-900 shadow-sm'
                  : 'text-slate-soft hover:text-ink-900'
              }`}
            >
              <ShoppingBag size={14} className="shrink-0" /> <span>Live Orders</span>
              {pendingOrders.length > 0 && (
                <span className="rounded-full bg-ember/15 text-ember-dim px-1.5 py-0.2 text-[10px] font-bold shrink-0">
                  {pendingOrders.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('items')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                activeTab === 'items'
                  ? 'bg-surface text-ink-900 shadow-sm'
                  : 'text-slate-soft hover:text-ink-900'
              }`}
            >
              <Pizza size={14} className="shrink-0" /> <span>Menu Catalog ({menuItems.length})</span>
            </button>
          </div>
        </div>

        {/* ORDERS TAB */}
        {activeTab === 'orders' && (
          <div className="space-y-4">
            {/* Metrics Row - Only shown for Live Orders */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <AdminMetricCard
                label="Pending Orders"
                value={pendingOrders.length}
                icon={ShoppingBag}
                tone={pendingOrders.length > 0 ? 'warning' : 'neutral'}
              />
              <AdminMetricCard
                label="Preparing"
                value={preparingOrders.length}
                icon={Clock3}
                tone={preparingOrders.length > 0 ? 'success' : 'neutral'}
              />
              <AdminMetricCard
                label="Fulfilled Today"
                value={fulfilledOrders.length}
                icon={CheckCircle2}
                tone="neutral"
              />
              <AdminMetricCard
                label="Catalog Items"
                value={menuItems.length}
                icon={UtensilsCrossed}
                tone="neutral"
                onClick={() => setActiveTab('items')}
              />
            </div>

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
            {/* Toolbar: Category Chips, Search & Actions */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 bg-surface-raised/30 p-2.5 rounded-2xl border border-surface-line">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 min-w-0">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                      selectedCategory === cat
                        ? 'bg-gold/15 text-gold-dim border border-gold/30 shadow-2xs'
                        : 'border border-surface-line customer-neutral-surface text-slate-soft hover:text-ink-900'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 shrink-0">
                <div className="relative w-full sm:w-60">
                  <Search className="w-3.5 h-3.5 text-slate-soft absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search items…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-xl border border-surface-line customer-neutral-surface pl-8 pr-3 py-1.5 text-xs text-ink-900 focus:outline-none focus:border-gold/50"
                  />
                </div>

                {!isCashier && (
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="secondary" icon={Layers} onClick={openBatchModal} size="sm">
                      Presets & Batch Add
                    </Button>
                    <Button variant="primary" icon={Plus} onClick={openCreateModal} size="sm">
                      Add Item
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {filteredItems.length === 0 ? (
              <AdminEmptyState
                icon={UtensilsCrossed}
                title="No Menu Items Found"
                description="Add food and beverage items or select from our Philippine market presets to start selling."
                action={
                  !isCashier ? (
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" icon={Layers} onClick={openBatchModal}>
                        Philippine Presets & Batch
                      </Button>
                      <Button variant="primary" icon={Plus} onClick={openCreateModal}>
                        Add Menu Item
                      </Button>
                    </div>
                  ) : null
                }
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {filteredItems.map((item) => {
                  const isAvail = item.is_available !== undefined ? Boolean(item.is_available) : Boolean(item.isAvailable)
                  const stock = item.stock_quantity !== undefined ? item.stock_quantity : item.stockQuantity
                  const isOutOfStock = stock !== null && stock !== undefined && Number(stock) === 0
                  const isLowStock = stock !== null && stock !== undefined && Number(stock) > 0 && Number(stock) <= 5

                  return (
                    <div
                      key={item.id}
                      className={`rounded-2xl border border-surface-line customer-neutral-surface overflow-hidden flex flex-col justify-between transition hover:border-gold/40 ${
                        !isAvail || isOutOfStock ? 'opacity-70' : ''
                      }`}
                    >
                      <div>
                        {/* Image Container with fixed height and contain */}
                        <div className={`h-32 min-h-[128px] w-full rounded-xl relative overflow-hidden flex items-center justify-center p-2 m-2 mb-0 transition shrink-0 ${item.image_url || item.imageUrl ? 'bg-white' : 'bg-surface-raised'}`}>
                          {item.image_url || item.imageUrl ? (
                            <img
                              src={item.image_url || item.imageUrl}
                              alt={item.name}
                              loading="lazy"
                              width="128"
                              height="128"
                              className="w-full h-full object-contain"
                              onError={(e) => { e.target.style.display = 'none' }}
                            />
                          ) : (
                            <UtensilsCrossed className="w-8 h-8 text-slate-soft/50" />
                          )}
                          <span className="absolute top-2 right-2 text-[9px] font-semibold uppercase px-2 py-0.5 rounded-full bg-surface text-ink-900 border border-surface-line shadow-xs">
                            {item.category || 'Food'}
                          </span>
                          {(!isAvail || isOutOfStock) && (
                            <div className="absolute inset-0 bg-surface/90 flex items-center justify-center">
                              <span className="text-[10px] font-semibold text-ember-dim px-2.5 py-0.5 bg-ember/15 rounded-full border border-ember/25">
                                {!isAvail ? 'Unavailable' : 'Out of Stock'}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="p-3.5 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="font-semibold text-xs text-ink-900 leading-snug">{item.name}</h4>
                            <span className="font-bold text-xs text-gold-dim stat-figure">
                              ₱{Number(item.price || 0).toFixed(2)}
                            </span>
                          </div>

                          {item.description && (
                            <p className="text-[11px] text-slate-soft line-clamp-2">{item.description}</p>
                          )}

                          <div className="flex items-center gap-1.5 pt-0.5">
                            {stock == null ? (
                              <span className="text-[10px] font-semibold text-teal-dim bg-teal/10 px-2 py-0.5 rounded-md border border-teal/20">
                                Unlimited Stock
                              </span>
                            ) : isOutOfStock ? (
                              <span className="text-[10px] font-semibold text-ember-dim bg-ember/15 px-2 py-0.5 rounded-md border border-ember/25">
                                Out of Stock (0)
                              </span>
                            ) : isLowStock ? (
                              <span className="text-[10px] font-semibold text-gold-dim bg-gold/15 px-2 py-0.5 rounded-md border border-gold/25">
                                Low Stock: {stock} left
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold text-slate-soft bg-surface-raised px-2 py-0.5 rounded-md border border-surface-line">
                                Stock: {stock}
                              </span>
                            )}
                          </div>
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
        description="Configure product details, category, pricing, and stock inventory."
        maxWidth="max-w-2xl"
        footer={
          <div className="flex items-center justify-between w-full">
            <div>
              {editingItem && (
                <Button
                  variant="ghost"
                  disabled={submitting}
                  onClick={() => {
                    const target = editingItem
                    setModalOpen(false)
                    setDeleteTarget(target)
                  }}
                  className="flex items-center gap-1.5 text-xs text-ember-dim hover:bg-ember/10 border border-ember/20"
                >
                  <Trash2 size={13} />
                  Delete Item
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setModalOpen(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSaveItem} disabled={submitting || !formData.name.trim() || !(Number(formData.price) > 0)}>
                {submitting ? 'Saving…' : 'Save Item'}
              </Button>
            </div>
          </div>
        }
      >
        <form onSubmit={handleSaveItem} className="space-y-4.5 py-1">
          {/* Row 1: Item Name + Category */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="eyebrow mb-1.5 block">Item Name <span className="text-ember-dim">*</span></label>
              <input
                type="text"
                required
                autoFocus
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Pancit Canton (Calamansi / Extra Hot)"
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
                <option value="Food">Food (Meals, Rice, Noodles)</option>
                <option value="Drinks">Drinks (Soda, Energy, Coffee, Juice)</option>
                <option value="Snacks">Snacks (Chips, Biscuits, Candies)</option>
                <option value="Combos">Combos (Meal & Drink Bundles)</option>
              </select>
            </div>
          </div>

          {/* Row 2: Price + Stock Quantity */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="eyebrow mb-1.5 block">Unit Price (₱) <span className="text-ember-dim">*</span></label>
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
            <div>
              <label className="eyebrow mb-1.5 block">Stock Quantity <span className="text-slate-soft font-normal text-[10px]">(Leave blank for unlimited)</span></label>
              <NumericInput
                min="0"
                step="1"
                value={formData.stockQuantity}
                onChange={(e) => setFormData({ ...formData, stockQuantity: e.target.value })}
                placeholder="Unlimited stock"
                className={inputClass}
              />
            </div>
          </div>

          {/* Row 3: Active Status Modern Toggle Switch */}
          <div className="flex items-center justify-between p-3.5 rounded-xl border border-surface-line customer-neutral-surface">
            <div>
              <span className="text-xs font-bold text-ink-900 block">Listed on Station Menu</span>
              <span className="text-[11px] text-slate-soft">Allow customers to order this item directly from their PC station kiosk.</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={formData.isAvailable}
              onClick={() => setFormData({ ...formData, isAvailable: !formData.isAvailable })}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                formData.isAvailable ? 'bg-gold' : 'bg-surface-raised border-surface-line'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                  formData.isAvailable ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Row 4: Product Photo */}
          <div>
            <label className="eyebrow mb-1.5 block">Product Photo / Display Image</label>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 rounded-2xl border border-surface-line customer-neutral-surface">
              <div className="w-20 h-20 rounded-2xl bg-white overflow-hidden flex items-center justify-center p-2 shrink-0 border border-surface-line shadow-xs">
                {formData.imageUrl ? (
                  <img
                    src={formData.imageUrl}
                    alt="Preview"
                    className="w-full h-full object-contain"
                    onError={(e) => { e.target.style.display = 'none' }}
                  />
                ) : (
                  <UtensilsCrossed className="w-8 h-8 text-slate-400" />
                )}
              </div>
              <div className="flex-1 w-full space-y-2.5">
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-surface border border-surface-line hover:border-gold/50 text-ink-900 transition shadow-xs">
                    <Upload size={13} /> Upload Image File
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageFileUpload}
                    />
                  </label>
                  {formData.imageUrl && (
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, imageUrl: '' })}
                      className="px-2.5 py-1.5 text-xs font-semibold rounded-xl text-ember-dim hover:bg-ember/10 transition border border-ember/20 cursor-pointer"
                    >
                      Clear Photo
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={formData.imageUrl}
                  onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                  placeholder="Or paste public image URL (https://… or /assets/food/...)"
                  className="w-full text-xs rounded-xl border border-surface-line customer-neutral-surface px-3 py-2 text-ink-900 focus:outline-none focus:border-gold/50 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Row 5: Description */}
          <div>
            <label className="eyebrow mb-1.5 block">Description / Serving Notes (Optional)</label>
            <textarea
              rows={2}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Flavors, preparation instructions, or serving size details…"
              className={`${inputClass} resize-none`}
            />
          </div>
        </form>
      </Modal>

      {/* BATCH ADD / PRESETS MODAL */}
      <Modal
        open={batchModalOpen}
        onClose={() => setBatchModalOpen(false)}
        eyebrow="Philippine iCafe Catalog"
        title={batchStep === 'catalog' ? 'Batch Add Menu Presets' : 'Configure Batch Prices & Stock'}
        description={
          batchStep === 'catalog'
            ? 'Select popular Philippine internet cafe snacks, noodles, chips, drinks, and biscuits.'
            : 'Review selected items, set customized prices (₱), and define initial stock quantities.'
        }
        maxWidth="max-w-4xl"
        footer={
          <div className="flex items-center justify-between w-full">
            <div>
              {batchStep === 'catalog' ? (
                <span className="text-xs text-slate-soft">
                  {selectedPresetIds.size} item{selectedPresetIds.size === 1 ? '' : 's'} selected
                </span>
              ) : (
                <Button
                  variant="ghost"
                  icon={ArrowLeft}
                  onClick={() => setBatchStep('catalog')}
                  disabled={batchSubmitting}
                >
                  Back to Catalog
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setBatchModalOpen(false)} disabled={batchSubmitting}>
                Cancel
              </Button>
              {batchStep === 'catalog' ? (
                <Button
                  variant="primary"
                  icon={ArrowRight}
                  onClick={proceedToConfigure}
                  disabled={selectedPresetIds.size === 0}
                >
                  Configure Prices & Stock ({selectedPresetIds.size})
                </Button>
              ) : (
                <Button
                  variant="primary"
                  icon={Plus}
                  onClick={handleSaveBatch}
                  disabled={batchSubmitting || batchRows.length === 0}
                >
                  {batchSubmitting ? 'Adding Items…' : `Add ${batchRows.length} Items to Menu`}
                </Button>
              )}
            </div>
          </div>
        }
      >
        {batchStep === 'catalog' ? (
          <div className="space-y-4 max-h-[65vh] flex flex-col min-h-0">
            {/* Toolbar: Category Chips & Search & Quick Select */}
            <div className="space-y-2 shrink-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex gap-1.5 overflow-x-auto pb-1 max-w-full">
                  {PHILIPPINE_MENU_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setPresetCategory(cat)}
                      className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                        presetCategory === cat
                          ? 'bg-gold/15 text-gold-dim border border-gold/30'
                          : 'border border-surface-line customer-neutral-surface text-slate-soft hover:text-ink-900'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <div className="relative w-full sm:w-56 shrink-0">
                  <Search className="w-3.5 h-3.5 text-slate-soft absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search Philippine items…"
                    value={presetSearch}
                    onChange={(e) => setPresetSearch(e.target.value)}
                    className="w-full rounded-xl border border-surface-line customer-neutral-surface pl-8 pr-3 py-1.5 text-xs text-ink-900 focus:outline-none focus:border-gold/50"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 text-xs text-slate-soft">
                <span>Showing {filteredPresets.length} items</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAllFilteredPresets}
                    className="text-gold-dim hover:underline font-semibold"
                  >
                    Select All in View
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={deselectAllPresets}
                    className="text-slate-soft hover:text-ink-900"
                  >
                    Deselect All
                  </button>
                </div>
              </div>
            </div>

            {/* Presets Grid */}
            <div className="overflow-y-auto pr-1 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
              {filteredPresets.map((preset) => {
                const isSelected = selectedPresetIds.has(preset.id)
                return (
                  <div
                    key={preset.id}
                    onClick={() => togglePreset(preset.id)}
                    className={`rounded-2xl border p-2.5 cursor-pointer transition flex flex-col justify-between select-none ${
                      isSelected
                        ? 'border-gold bg-gold/10 shadow-sm'
                        : 'border-surface-line customer-neutral-surface hover:border-gold/40'
                    }`}
                  >
                    <div>
                      <div className="h-28 rounded-xl bg-surface-raised relative overflow-hidden flex items-center justify-center p-2 mb-2">
                        <img
                          src={preset.imageUrl}
                          alt={preset.name}
                          className="w-full h-full object-contain"
                          onError={(e) => { e.target.style.display = 'none' }}
                        />
                        <div className="absolute top-1.5 left-1.5">
                          {isSelected ? (
                            <div className="w-5 h-5 rounded-md bg-gold flex items-center justify-center text-ink-900 shadow">
                              <CheckCircle2 size={14} className="stroke-[3]" />
                            </div>
                          ) : (
                            <div className="w-5 h-5 rounded-md border border-surface-line bg-surface/80" />
                          )}
                        </div>
                        <span className="absolute bottom-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-surface/90 text-gold-dim border border-surface-line">
                          ₱{preset.price.toFixed(2)}
                        </span>
                      </div>
                      <h4 className="font-semibold text-xs text-ink-900 leading-snug line-clamp-2">{preset.name}</h4>
                      <p className="text-[10px] text-slate-soft mt-0.5">{preset.subcategory || preset.category}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-4 max-h-[65vh] flex flex-col min-h-0">
            <div className="flex items-center justify-between shrink-0">
              <p className="text-xs text-slate-soft">
                Adjust the unit prices and stock quantities for each item before saving to your menu.
              </p>
              <Button variant="ghost" size="sm" icon={Plus} onClick={addCustomBatchRow}>
                Add Blank Row
              </Button>
            </div>

            <div className="overflow-y-auto pr-1 border border-surface-line rounded-2xl divide-y divide-surface-line">
              {batchRows.map((row, idx) => (
                <div key={idx} className="p-3 customer-neutral-surface flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <label
                      className="relative w-12 h-12 rounded-xl bg-white flex items-center justify-center shrink-0 p-1 border border-surface-line cursor-pointer group shadow-xs"
                      title="Click to change photo for this preset"
                    >
                      {row.imageUrl ? (
                        <img src={row.imageUrl} alt="" className="w-full h-full object-contain" />
                      ) : (
                        <UtensilsCrossed size={16} className="text-slate-400" />
                      )}
                      <div className="absolute inset-0 bg-ink-900/60 rounded-xl opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition">
                        <Camera size={14} />
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          if (file.size > 2.5 * 1024 * 1024) {
                            showToast({ title: 'File Too Large', message: 'Image must be less than 2.5MB.', tone: 'error' })
                            return
                          }
                          const reader = new FileReader()
                          reader.onload = (ev) => {
                            updateBatchRow(idx, 'imageUrl', ev.target.result)
                            showToast({ title: 'Photo Changed', message: `Custom photo loaded for ${row.name || 'item'}.` })
                          }
                          reader.readAsDataURL(file)
                        }}
                      />
                    </label>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <input
                        type="text"
                        value={row.name}
                        onChange={(e) => updateBatchRow(idx, 'name', e.target.value)}
                        placeholder="Item name…"
                        className="w-full text-xs font-semibold text-ink-900 bg-transparent border-b border-transparent focus:border-gold/50 focus:outline-none"
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-soft shrink-0">{row.subcategory || row.category}</span>
                        <input
                          type="text"
                          value={row.imageUrl || ''}
                          onChange={(e) => updateBatchRow(idx, 'imageUrl', e.target.value)}
                          placeholder="Image URL or click thumbnail to upload…"
                          className="flex-1 text-[10px] text-slate-soft bg-transparent border-b border-surface-line/40 focus:border-gold/50 focus:outline-none truncate font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-2 gap-2 sm:w-64 shrink-0">
                    <div>
                      <label className="text-[10px] text-slate-soft uppercase font-semibold block mb-0.5">Price (₱)</label>
                      <NumericInput
                        min="0"
                        step="0.50"
                        value={row.price}
                        onChange={(e) => updateBatchRow(idx, 'price', e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-soft uppercase font-semibold block mb-0.5">Stock Qty</label>
                      <NumericInput
                        min="0"
                        step="1"
                        placeholder="Unlimited"
                        value={row.stockQuantity}
                        onChange={(e) => updateBatchRow(idx, 'stockQuantity', e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeBatchRow(idx)}
                    className="p-1.5 rounded-lg text-slate-soft hover:text-ember-dim hover:bg-ember/10 self-end sm:self-center shrink-0"
                    title="Remove item"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
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
