import { useState } from 'react'
import { Plus, Edit2, Trash2, CheckCircle2, Clock, XCircle, UtensilsCrossed, AlertCircle, ShoppingBag, Coffee, Pizza, Sparkles, Check, Flame } from 'lucide-react'
import { useAppData } from '../context/AppDataContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { showToast } from '../lib/toast.js'
import Button from '../components/common/Button.jsx'

import ConfirmModal from '../components/common/ConfirmModal.jsx'

const CATEGORIES = ['All', 'Food', 'Drinks', 'Snacks', 'Combos']

export default function MenuManagementPage() {
  const { menuItems, menuOrders, createMenuItem, updateMenuItem, deleteMenuItem, updateOrderStatus, cancelMenuOrder } = useAppData()
  const { user } = useAuth()
  const isCashier = user?.role === 'cashier'
  const [activeTab, setActiveTab] = useState('orders') // 'orders' | 'items'
  const [selectedCategory, setSelectedCategory] = useState('All')
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

  const filteredItems = menuItems.filter(
    (item) => selectedCategory === 'All' || item.category?.toLowerCase() === selectedCategory.toLowerCase()
  )

  const pendingOrdersCount = menuOrders.filter((o) => o.order_status === 'pending' || o.orderStatus === 'pending').length

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
    e.preventDefault()
    setSubmitting(true)
    try {
      if (editingItem) {
        await updateMenuItem(editingItem.id, {
          name: formData.name,
          category: formData.category,
          price: Number(formData.price),
          description: formData.description,
          imageUrl: formData.imageUrl,
          isAvailable: formData.isAvailable,
        })
        showToast({ title: 'Item Updated', message: formData.name })
      } else {
        await createMenuItem({
          name: formData.name,
          category: formData.category,
          price: Number(formData.price),
          description: formData.description,
          imageUrl: formData.imageUrl,
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
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <UtensilsCrossed className="w-7 h-7 text-amber-400" />
            Snack & Drink Management
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage food catalog, live in-session customer orders, and kitchen fulfillment.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-900 border border-slate-800 rounded-xl p-1">
            <button
              onClick={() => setActiveTab('orders')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
                activeTab === 'orders'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <ShoppingBag className="w-4 h-4" /> Live Orders
              {pendingOrdersCount > 0 && (
                <span className="bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-extrabold animate-pulse">
                  {pendingOrdersCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('items')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
                activeTab === 'items'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Pizza className="w-4 h-4" /> Menu Catalog ({menuItems.length})
            </button>
          </div>
          {activeTab === 'items' && !isCashier && (
            <Button onClick={openCreateModal} className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Item
            </Button>
          )}
        </div>
      </div>

      {/* ORDERS TAB */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          {menuOrders.length === 0 ? (
            <div className="p-12 text-center border border-slate-800 rounded-2xl bg-slate-900/40">
              <ShoppingBag className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <h3 className="text-base font-bold text-white">No Customer Orders Yet</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Orders placed from customer stations will appear here in real-time with chime alerts.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {menuOrders.map((order) => {
                const status = order.order_status || order.orderStatus || 'pending'
                const items = typeof order.items === 'string' ? JSON.parse(order.items || '[]') : order.items || []
                return (
                  <div
                    key={order.id}
                    className={`p-5 rounded-2xl border transition flex flex-col justify-between ${
                      status === 'pending'
                        ? 'bg-amber-950/20 border-amber-500/40 shadow-lg shadow-amber-500/5'
                        : status === 'preparing'
                        ? 'bg-sky-950/20 border-sky-500/40'
                        : status === 'fulfilled'
                        ? 'bg-emerald-950/20 border-emerald-500/30'
                        : 'bg-slate-900/40 border-slate-800 opacity-60'
                    }`}
                  >
                    <div>
                      {/* Top bar */}
                      <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-sm text-white px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700">
                            {order.pc_label || order.pcLabel || 'Station'}
                          </span>
                          <span className="text-xs text-slate-300 font-medium truncate max-w-[120px]">
                            {order.customer_name || order.customerName || 'Guest / Customer'}
                          </span>
                        </div>
                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                            status === 'pending'
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse'
                              : status === 'preparing'
                              ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                              : status === 'fulfilled'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {status}
                        </span>
                      </div>

                      {/* Items List */}
                      <div className="py-3 space-y-1.5">
                        {items.map((it, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs">
                            <span className="text-slate-300">
                              <strong className="text-white">{it.quantity}x</strong> {it.name}
                            </span>
                            <span className="text-slate-400 font-mono">
                              ₱{(Number(it.price || 0) * Number(it.quantity || 1)).toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Order Footer & Actions */}
                    <div className="pt-3 border-t border-slate-800/80 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">
                          Payment: <strong className="text-slate-200 capitalize">{order.payment_method || order.paymentMethod || 'cash'}</strong>
                        </span>
                        <span className="text-base font-black text-amber-400 font-mono">
                          ₱{Number(order.total || 0).toFixed(2)}
                        </span>
                      </div>

                      {status !== 'fulfilled' && status !== 'cancelled' && (
                        <div className="flex items-center gap-2 pt-1">
                          {status === 'pending' && (
                            <button
                              onClick={() => handleStatusChange(order.id, 'preparing')}
                              className="flex-1 py-1.5 px-3 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs transition"
                            >
                              Prepare
                            </button>
                          )}
                          {status === 'preparing' && (
                            <button
                              onClick={() => handleStatusChange(order.id, 'fulfilled')}
                              className="flex-1 py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition"
                            >
                              Fulfill & Serve
                            </button>
                          )}
                          <button
                            onClick={() => promptCancelOrder(order.id)}
                            className="py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-rose-900/50 hover:border-rose-500 text-slate-300 hover:text-rose-300 border border-slate-700 font-semibold text-xs transition"
                          >
                            Cancel
                          </button>
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
        <div className="space-y-6">
          {/* Category Filter */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                  selectedCategory === cat
                    ? 'bg-amber-500 text-slate-950 shadow-md'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {filteredItems.length === 0 ? (
            <div className="p-12 text-center border border-slate-800 rounded-2xl bg-slate-900/40">
              <UtensilsCrossed className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <h3 className="text-base font-bold text-white">No items in this category</h3>
              <p className="text-xs text-slate-400 mt-1">Add items to start selling food and drinks to customers.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredItems.map((item) => {
                const isAvail = item.is_available !== undefined ? Boolean(item.is_available) : Boolean(item.isAvailable)
                return (
                  <div
                    key={item.id}
                    className={`rounded-2xl border overflow-hidden flex flex-col justify-between transition ${
                      isAvail ? 'bg-slate-900/80 border-slate-800 hover:border-slate-700' : 'bg-slate-950/60 border-slate-800/60 opacity-60'
                    }`}
                  >
                    <div>
                      {/* Image */}
                      <div className="h-36 bg-slate-800 relative overflow-hidden flex items-center justify-center">
                        {item.image_url || item.imageUrl ? (
                          <img
                            src={item.image_url || item.imageUrl}
                            alt={item.name}
                            className="w-full h-full object-cover"
                            onError={(e) => { e.target.style.display = 'none' }}
                          />
                        ) : (
                          <UtensilsCrossed className="w-10 h-10 text-slate-600" />
                        )}
                        <span className="absolute top-2 right-2 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-slate-950/80 backdrop-blur-md text-amber-400 border border-slate-700">
                          {item.category || 'Food'}
                        </span>
                        {!isAvail && (
                          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center">
                            <span className="text-xs font-bold text-rose-400 px-3 py-1 bg-rose-950/80 rounded-full border border-rose-800">
                              Out of Stock
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-bold text-sm text-white">{item.name}</h4>
                          <span className="font-extrabold text-sm text-amber-400 font-mono">
                            ₱{Number(item.price || 0).toFixed(2)}
                          </span>
                        </div>
                        {item.description && (
                          <p className="text-xs text-slate-400 mt-1 line-clamp-2">{item.description}</p>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="p-4 pt-0 flex items-center justify-end gap-2 border-t border-slate-800/40 mt-2">
                      <button
                        onClick={() => openEditModal(item)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                        title="Edit Item"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      {!isCashier && (
                        <button
                          onClick={() => promptDeleteItem(item)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 hover:text-rose-400 text-slate-400 transition"
                          title="Delete Item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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

      {/* CREATE / EDIT MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-base font-bold text-white">
                {editingItem ? 'Edit Menu Item' : 'Add New Menu Item'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-white p-1 rounded-lg">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveItem} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Item Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Pancit Canton"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="Food">Food</option>
                    <option value="Drinks">Drinks</option>
                    <option value="Snacks">Snacks</option>
                    <option value="Combos">Combos</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Price (₱) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="25.00"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="flex items-center pt-6">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-300">
                    <input
                      type="checkbox"
                      checked={formData.isAvailable}
                      onChange={(e) => setFormData({ ...formData, isAvailable: e.target.checked })}
                      className="w-4 h-4 rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-0"
                    />
                    Available in Stock
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Photo / Image URL</label>
                <input
                  type="url"
                  value={formData.imageUrl}
                  onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Details, flavors, or serving size..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={submitting} className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold">
                  {submitting ? 'Saving…' : 'Save Item'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

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
    </div>
  )
}
