import { useState, useEffect, useMemo } from 'react'
import { UtensilsCrossed, Plus, Minus, ShoppingBag, Wallet, Banknote, CheckCircle2, AlertCircle } from 'lucide-react'
import { useAppData } from '../../context/AppDataContext.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { showToast } from '../../lib/toast.js'
import Button from '../common/Button.jsx'
import Modal from '../common/Modal.jsx'

const CATEGORIES = ['All', 'Food', 'Drinks', 'Snacks', 'Combos']

export default function MenuOrderModal({ isOpen, onClose }) {
  const { menuItems, placeMenuOrder, currentMember } = useAppData()
  const { user } = useAuth()
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [cart, setCart] = useState({}) // { [itemId]: { item, quantity } }
  const [paymentMethod, setPaymentMethod] = useState('wallet') // 'wallet' | 'cash'
  const [submitting, setSubmitting] = useState(false)

  const walletBalance = Number(currentMember?.wallet || currentMember?.walletBalance || user?.wallet || 0)
  const isGuest = user?.role === 'guest'

  useEffect(() => {
    if (isGuest) setPaymentMethod('cash')
  }, [isGuest])

  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
      const isAvail = item.is_available !== undefined ? Boolean(item.is_available) : Boolean(item.isAvailable)
      if (!isAvail) return false
      return selectedCategory === 'All' || item.category?.toLowerCase() === selectedCategory.toLowerCase()
    })
  }, [menuItems, selectedCategory])

  const cartItems = Object.values(cart)
  const totalAmount = cartItems.reduce((acc, { item, quantity }) => acc + Number(item.price || 0) * quantity, 0)
  const canPayWallet = !isGuest && walletBalance >= totalAmount

  function addToCart(item) {
    const stock = item.stock_quantity !== undefined ? item.stock_quantity : item.stockQuantity
    if (stock !== null && stock !== undefined && Number(stock) <= 0) {
      showToast({ title: 'Out of Stock', message: `"${item.name}" is currently out of stock.`, tone: 'warning' })
      return
    }
    setCart((curr) => {
      const existing = curr[item.id]
      const currentQty = existing ? existing.quantity : 0
      if (stock !== null && stock !== undefined && currentQty >= Number(stock)) {
        showToast({ title: 'Stock Limit Reached', message: `Only ${stock} available in stock.`, tone: 'warning' })
        return curr
      }
      return { ...curr, [item.id]: { item, quantity: currentQty + 1 } }
    })
  }

  function removeFromCart(itemId) {
    setCart((curr) => {
      const existing = curr[itemId]
      if (!existing) return curr
      if (existing.quantity <= 1) {
        const next = { ...curr }
        delete next[itemId]
        return next
      }
      return { ...curr, [itemId]: { ...existing, quantity: existing.quantity - 1 } }
    })
  }

  async function handleCheckout() {
    if (cartItems.length === 0) return
    if (paymentMethod === 'wallet' && !canPayWallet) {
      showToast({ title: 'Insufficient Wallet', message: 'Not enough wallet balance. Please choose Cash or top up your account.', tone: 'error' })
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        items: cartItems.map(({ item, quantity }) => ({
          id: item.id,
          name: item.name,
          price: Number(item.price),
          quantity,
        })),
        total: totalAmount,
        paymentMethod,
      }
      await placeMenuOrder(payload)
      showToast({
        title: 'Order Placed!',
        message: paymentMethod === 'wallet'
          ? `₱${totalAmount.toFixed(2)} debited from wallet. Kitchen is preparing your order!`
          : `Order sent! Please prepare ₱${totalAmount.toFixed(2)} for the staff.`,
        tone: 'success',
      })
      setCart({})
      onClose()
    } catch (err) {
      showToast({ title: 'Order Failed', message: err.message, tone: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      eyebrow="Cafe Kitchen"
      title="Order Food & Drinks"
      description="Select items to order directly to your station."
      maxWidth="max-w-4xl"
      busy={submitting}
      footer={
        <div className="flex flex-col sm:flex-row items-center justify-between w-full gap-3">
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-soft">
              Total ({cartItems.reduce((s, i) => s + i.quantity, 0)} items):
            </span>
            <span className="stat-figure text-lg font-bold text-ink-900">
              ₱{totalAmount.toFixed(2)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCheckout}
              disabled={submitting || cartItems.length === 0}
            >
              {submitting ? 'Placing Order…' : 'Place Order'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-4 min-h-[360px] max-h-[60vh] overflow-hidden">
        {/* Catalog Side */}
        <div className="flex flex-col min-h-0 space-y-3 overflow-hidden">
          {/* Category Chips */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 shrink-0">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-xl text-xs font-semibold transition whitespace-nowrap ${
                  selectedCategory === cat
                    ? 'bg-gold/15 text-gold-dim border border-gold/30'
                    : 'border border-surface-line customer-neutral-surface text-slate-soft hover:text-ink-900'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Item Grid */}
          <div className="overflow-y-auto pr-1 flex-1 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {filteredItems.length === 0 ? (
              <div className="col-span-full py-12 text-center text-slate-soft text-xs">
                No items available in this category.
              </div>
            ) : (
              filteredItems.map((item) => {
                const stock = item.stock_quantity !== undefined ? item.stock_quantity : item.stockQuantity
                const isOutOfStock = stock !== null && stock !== undefined && Number(stock) <= 0
                const isLowStock = stock !== null && stock !== undefined && Number(stock) > 0 && Number(stock) <= 5
                const inCart = cart[item.id]?.quantity || 0
                const isAtMaxStock = stock !== null && stock !== undefined && inCart >= Number(stock)

                return (
                  <div
                    key={item.id}
                    className={`rounded-2xl border border-surface-line customer-neutral-surface p-3 flex flex-col justify-between hover:border-gold/40 transition ${
                      isOutOfStock ? 'opacity-60' : ''
                    }`}
                  >
                    <div>
                      <div className={`h-24 rounded-xl overflow-hidden relative mb-2 flex items-center justify-center p-1.5 transition ${item.image_url || item.imageUrl ? 'bg-white' : 'bg-surface-raised'}`}>
                        {item.image_url || item.imageUrl ? (
                          <img src={item.image_url || item.imageUrl} alt={item.name} className="w-full h-full object-contain" onError={(e) => { e.target.style.display = 'none' }} />
                        ) : (
                          <UtensilsCrossed className="w-7 h-7 text-slate-soft/50" />
                        )}
                        <span className="absolute top-1 right-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-surface/90 text-gold-dim border border-surface-line shadow-xs">
                          ₱{Number(item.price).toFixed(2)}
                        </span>
                        {isOutOfStock && (
                          <div className="absolute inset-0 bg-surface/80 backdrop-blur-2xs flex items-center justify-center">
                            <span className="text-[10px] font-semibold text-ember-dim px-2 py-0.5 bg-ember/15 rounded-full border border-ember/25">
                              Out of Stock
                            </span>
                          </div>
                        )}
                      </div>
                      <h4 className="font-semibold text-xs text-ink-900 truncate">{item.name}</h4>
                      {item.description && (
                        <p className="text-[11px] text-slate-soft line-clamp-1 mt-0.5">{item.description}</p>
                      )}
                      {isLowStock && (
                        <p className="text-[10px] font-semibold text-ember-dim mt-1">
                          Only {stock} left!
                        </p>
                      )}
                    </div>
                    <div className="mt-2.5">
                      {isOutOfStock ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled
                          className="w-full justify-center text-slate-soft cursor-not-allowed"
                        >
                          Out of Stock
                        </Button>
                      ) : inCart > 0 ? (
                        <div className="flex items-center justify-between border border-surface-line customer-neutral-surface rounded-xl px-2 py-1">
                          <button
                            type="button"
                            onClick={() => removeFromCart(item.id)}
                            className="text-slate-soft hover:text-ink-900 p-0.5"
                          >
                            <Minus size={12} />
                          </button>
                          <span className="text-xs font-bold text-ink-900 stat-figure">{inCart}</span>
                          <button
                            type="button"
                            onClick={() => addToCart(item)}
                            disabled={isAtMaxStock}
                            className={`p-0.5 ${isAtMaxStock ? 'text-slate-soft/30 cursor-not-allowed' : 'text-slate-soft hover:text-ink-900'}`}
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-center"
                          onClick={() => addToCart(item)}
                        >
                          <Plus size={12} /> Add
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Cart & Payment Side */}
        <div className="flex flex-col min-h-0 border-t md:border-t-0 md:border-l border-surface-line pl-0 md:pl-4 pt-3 md:pt-0 space-y-3">
          <div className="flex items-center justify-between">
            <p className="eyebrow flex items-center gap-1.5">
              <ShoppingBag size={12} /> Your Tray ({cartItems.length})
            </p>
          </div>

          <div className="overflow-y-auto flex-1 space-y-1.5 max-h-48 md:max-h-none pr-1">
            {cartItems.length === 0 ? (
              <div className="py-8 text-center text-slate-soft text-xs">
                Your tray is empty.
              </div>
            ) : (
              cartItems.map(({ item, quantity }) => {
                const stock = item.stock_quantity !== undefined ? item.stock_quantity : item.stockQuantity
                const isAtMaxStock = stock !== null && stock !== undefined && quantity >= Number(stock)
                return (
                  <div key={item.id} className="p-2 rounded-xl border border-surface-line customer-neutral-surface flex items-center justify-between text-xs">
                    <div className="min-w-0 pr-2">
                      <p className="font-semibold text-ink-900 truncate">{item.name}</p>
                      <p className="text-[11px] text-slate-soft">
                        ₱{Number(item.price).toFixed(2)} × {quantity}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => removeFromCart(item.id)}
                        className="p-1 rounded-md text-slate-soft hover:text-ink-900 hover:bg-dance/35"
                      >
                        <Minus size={11} />
                      </button>
                      <span className="font-mono font-semibold text-ink-900 w-4 text-center">{quantity}</span>
                      <button
                        type="button"
                        onClick={() => addToCart(item)}
                        disabled={isAtMaxStock}
                        className={`p-1 rounded-md ${isAtMaxStock ? 'text-slate-soft/30 cursor-not-allowed' : 'text-slate-soft hover:text-ink-900 hover:bg-dance/35'}`}
                      >
                        <Plus size={11} />
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Payment selector */}
          <div className="border-t border-surface-line pt-3 space-y-2 shrink-0">
            <p className="eyebrow">Payment Option</p>
            <div className="grid grid-cols-2 gap-1.5">
              {!isGuest && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod('wallet')}
                  className={`p-2 rounded-xl text-xs font-semibold border transition flex flex-col items-center gap-1 ${
                    paymentMethod === 'wallet'
                      ? 'bg-gold/15 border-gold/35 text-gold-dim'
                      : 'border-surface-line customer-neutral-surface text-slate-soft hover:text-ink-900'
                  }`}
                >
                  <Wallet size={14} />
                  <span>Wallet (₱{walletBalance.toFixed(2)})</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setPaymentMethod('cash')}
                className={`p-2 rounded-xl text-xs font-semibold border transition flex flex-col items-center gap-1 ${
                  paymentMethod === 'cash' || isGuest
                    ? 'bg-gold/15 border-gold/35 text-gold-dim'
                    : 'border-surface-line customer-neutral-surface text-slate-soft hover:text-ink-900'
                }`}
              >
                <Banknote size={14} />
                <span>Cash at Counter</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}
