import { useState, useEffect, useMemo } from 'react'
import { UtensilsCrossed, Plus, Minus, ShoppingBag, Wallet, Banknote, AlertCircle } from 'lucide-react'
import { useAppData } from '../../context/AppDataContext.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { showToast } from '../../lib/toast.js'
import Button from '../common/Button.jsx'
import Modal from '../common/Modal.jsx'

export default function MenuOrderModal({ isOpen, onClose, cart: externalCart, onCartChange: setExternalCart }) {
  const { menuItems = [], placeMenuOrder, currentMember, myOrders = [] } = useAppData()
  const { user } = useAuth()
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [internalCart, setInternalCart] = useState({}) // { [itemId]: quantity }
  const [paymentMethod, setPaymentMethod] = useState('wallet') // 'wallet' | 'cash'
  const [submitting, setSubmitting] = useState(false)

  const isControlled = externalCart !== undefined && setExternalCart !== undefined
  const cart = isControlled ? externalCart : internalCart
  const setCart = isControlled ? setExternalCart : setInternalCart

  const walletBalance = Number(currentMember?.wallet || currentMember?.walletBalance || user?.wallet || 0)
  const isGuest = user?.role === 'guest'

  const pendingOrdersCount = useMemo(() => {
    return (myOrders || []).filter((o) => {
      const status = o.order_status || o.orderStatus || o.status || 'pending'
      return status === 'pending' || status === 'preparing'
    }).length
  }, [myOrders])

  useEffect(() => {
    if (isGuest) setPaymentMethod('cash')
  }, [isGuest])

  const dynamicCategories = useMemo(() => {
    const cats = new Set(['All'])
    menuItems.forEach((item) => {
      const isAvail = item.is_available !== undefined ? Boolean(item.is_available) : Boolean(item.isAvailable)
      if (isAvail && item.category) {
        const c = item.category.trim()
        if (c) cats.add(c.charAt(0).toUpperCase() + c.slice(1).toLowerCase())
      }
    })
    return Array.from(cats)
  }, [menuItems])

  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
      const isAvail = item.is_available !== undefined ? Boolean(item.is_available) : Boolean(item.isAvailable)
      if (!isAvail) return false
      return selectedCategory === 'All' || (item.category || '').toLowerCase() === selectedCategory.toLowerCase()
    })
  }, [menuItems, selectedCategory])

  const cartItems = useMemo(() => {
    return Object.entries(cart)
      .map(([id, quantity]) => {
        const item = menuItems.find((m) => String(m.id) === String(id))
        return item && quantity > 0 ? { item, quantity } : null
      })
      .filter(Boolean)
  }, [cart, menuItems])

  const totalAmount = cartItems.reduce((acc, { item, quantity }) => acc + Number(item.price || 0) * quantity, 0)
  const totalQuantity = cartItems.reduce((acc, { quantity }) => acc + quantity, 0)
  const canPayWallet = !isGuest && walletBalance >= totalAmount

  function addToCart(item) {
    const stock = item.stock_quantity !== undefined ? item.stock_quantity : item.stockQuantity
    if (stock !== null && stock !== undefined && Number(stock) <= 0) {
      showToast({ title: 'Out of Stock', message: `"${item.name}" is currently out of stock.`, tone: 'warning' })
      return
    }
    setCart((curr) => {
      const currentQty = curr[item.id] || 0
      if (stock !== null && stock !== undefined && currentQty >= Number(stock)) {
        showToast({ title: 'Stock Limit Reached', message: `Only ${stock} available in stock.`, tone: 'warning' })
        return curr
      }
      return { ...curr, [item.id]: currentQty + 1 }
    })
  }

  function removeFromCart(itemId) {
    setCart((curr) => {
      const currentQty = curr[itemId] || 0
      if (currentQty <= 1) {
        const next = { ...curr }
        delete next[itemId]
        return next
      }
      return { ...curr, [itemId]: currentQty - 1 }
    })
  }

  async function handleCheckout() {
    if (cartItems.length === 0) return
    if (pendingOrdersCount >= 3) {
      showToast({
        title: 'Order Limit Reached',
        message: 'You currently have 3 pending orders in the queue. Please wait for staff to complete them.',
        tone: 'warning',
      })
      return
    }
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
      title="Full Menu Catalog"
      description="Select items to order directly to your station."
      maxWidth="max-w-4xl"
      busy={submitting}
      footer={
        <div className="flex flex-col sm:flex-row items-center justify-between w-full gap-3">
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-soft font-semibold">
              Total ({totalQuantity} item{totalQuantity === 1 ? '' : 's'}):
            </span>
            <span className="font-mono text-xl font-black text-ink-900">
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
              disabled={submitting || cartItems.length === 0 || pendingOrdersCount >= 3}
            >
              {submitting
                ? 'Placing Order…'
                : pendingOrdersCount >= 3
                ? 'Queue Full (Max 3)'
                : `Place Order (₱${totalAmount.toFixed(2)})`}
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-[1fr_290px] gap-4 min-h-[380px] max-h-[62vh] overflow-hidden">
        {/* Catalog Side */}
        <div className="flex flex-col min-h-0 space-y-3 overflow-hidden">
          {/* Category Chips */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 shrink-0 scrollbar-none">
            {dynamicCategories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-gold text-midnight font-black shadow-xs'
                    : 'border border-surface-line bg-surface-raised/40 text-slate-soft hover:text-ink-900 hover:bg-surface-raised'
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
                const inCart = cart[item.id] || 0
                const isAtMaxStock = stock !== null && stock !== undefined && inCart >= Number(stock)

                return (
                  <div
                    key={item.id}
                    className={`rounded-2xl border border-surface-line bg-surface-raised/20 p-2.5 flex flex-col justify-between hover:border-gold/50 shadow-xs transition ${
                      isOutOfStock ? 'opacity-60' : ''
                    }`}
                  >
                    <div>
                      {/* Photo / Thumbnail */}
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => !isOutOfStock && addToCart(item)}
                        className="h-28 min-h-[112px] w-full rounded-xl overflow-hidden relative mb-2 flex items-center justify-center p-1.5 transition shrink-0 bg-surface-raised/50 border border-surface-line/50 cursor-pointer group select-none"
                        title={isOutOfStock ? 'Out of stock' : `Click to add ${item.name}`}
                      >
                        {item.image_url || item.imageUrl ? (
                          <img
                            src={item.image_url || item.imageUrl}
                            alt={item.name}
                            loading="lazy"
                            className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200"
                            onError={(e) => { e.currentTarget.style.display = 'none' }}
                          />
                        ) : (
                          <UtensilsCrossed className="w-8 h-8 text-slate-soft/40 group-hover:scale-110 transition-transform" />
                        )}
                        <span className="absolute top-1.5 right-1.5 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-surface/95 text-gold-dim border border-surface-line shadow-xs">
                          ₱{Number(item.price).toFixed(2)}
                        </span>
                        {inCart > 0 && (
                          <span className="absolute top-1.5 left-1.5 bg-gold text-midnight text-[9px] font-black px-1.5 py-0.5 rounded-md shadow-xs">
                            {inCart} in tray
                          </span>
                        )}
                        {isOutOfStock && (
                          <div className="absolute inset-0 bg-surface/85 flex items-center justify-center">
                            <span className="text-[10px] font-bold text-ember-dim px-2 py-0.5 bg-ember/15 rounded-full border border-ember/25">
                              Out of Stock
                            </span>
                          </div>
                        )}
                      </div>
                      <h4 className="font-bold text-xs text-ink-900 truncate" title={item.name}>{item.name}</h4>
                      {item.description && (
                        <p className="text-[11px] text-slate-soft line-clamp-1 mt-0.5">{item.description}</p>
                      )}
                      {isLowStock && (
                        <p className="text-[10px] font-bold text-ember-dim mt-1">
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
                          className="w-full justify-center text-slate-soft cursor-not-allowed !py-1 text-xs"
                        >
                          Out of Stock
                        </Button>
                      ) : inCart > 0 ? (
                        <div className="flex items-center justify-between border border-surface-line bg-surface-raised/50 rounded-xl px-2 py-1">
                          <button
                            type="button"
                            onClick={() => removeFromCart(item.id)}
                            className="text-slate-soft hover:text-ink-900 p-0.5 hover:bg-surface-raised rounded cursor-pointer"
                          >
                            <Minus size={12} />
                          </button>
                          <span className="text-xs font-bold text-ink-900 font-mono">{inCart}</span>
                          <button
                            type="button"
                            onClick={() => addToCart(item)}
                            disabled={isAtMaxStock}
                            className={`p-0.5 rounded cursor-pointer ${isAtMaxStock ? 'text-slate-soft/30 cursor-not-allowed' : 'text-slate-soft hover:text-ink-900 hover:bg-surface-raised'}`}
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      ) : (
                        <Button
                          variant="primary"
                          size="sm"
                          className="w-full justify-center !py-1 text-xs font-bold"
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
        <div className="flex flex-col min-h-0 border-t md:border-t-0 md:border-l border-surface-line pl-0 md:pl-4 pt-3 md:pt-0 space-y-3 bg-surface-raised/20 md:bg-transparent p-2.5 md:p-0 rounded-2xl md:rounded-none">
          <div className="flex items-center justify-between">
            <p className="eyebrow flex items-center gap-1.5 font-bold">
              <ShoppingBag size={13} className="text-gold-dim" /> Your Tray ({totalQuantity})
            </p>
            {cartItems.length > 0 && (
              <button
                type="button"
                onClick={() => setCart({})}
                className="text-[10px] font-bold text-ember-dim hover:underline cursor-pointer"
              >
                Clear All
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-1 space-y-1.5 max-h-48 md:max-h-none pr-1">
            {cartItems.length === 0 ? (
              <div className="py-12 text-center text-slate-soft text-xs flex flex-col items-center gap-1.5">
                <ShoppingBag size={24} className="text-slate-soft/30" />
                <span>Your tray is empty.</span>
                <span className="text-[10px]">Click any snack photo to add.</span>
              </div>
            ) : (
              cartItems.map(({ item, quantity }) => {
                const stock = item.stock_quantity !== undefined ? item.stock_quantity : item.stockQuantity
                const isAtMaxStock = stock !== null && stock !== undefined && quantity >= Number(stock)
                return (
                  <div key={item.id} className="p-2 rounded-xl border border-surface-line bg-surface-raised/40 flex items-center justify-between text-xs">
                    <div className="min-w-0 pr-2">
                      <p className="font-bold text-ink-900 truncate">{item.name}</p>
                      <p className="text-[11px] font-mono text-gold-dim font-bold">
                        ₱{Number(item.price).toFixed(2)} × {quantity}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => removeFromCart(item.id)}
                        className="h-6 w-6 rounded-md bg-surface-raised flex items-center justify-center text-slate-soft hover:text-ink-900 border border-surface-line cursor-pointer"
                      >
                        <Minus size={11} />
                      </button>
                      <span className="font-mono font-bold text-ink-900 w-5 text-center">{quantity}</span>
                      <button
                        type="button"
                        onClick={() => addToCart(item)}
                        disabled={isAtMaxStock}
                        className={`h-6 w-6 rounded-md bg-surface-raised flex items-center justify-center border border-surface-line cursor-pointer ${
                          isAtMaxStock ? 'text-slate-soft/30 cursor-not-allowed' : 'text-slate-soft hover:text-ink-900'
                        }`}
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
          <div className="border-t border-surface-line pt-2.5 space-y-2 shrink-0">
            <p className="eyebrow">Payment Option</p>
            <div className="grid grid-cols-2 gap-1.5">
              {!isGuest && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod('wallet')}
                  className={`p-2 rounded-xl text-xs font-bold border transition flex flex-col items-center gap-1 cursor-pointer ${
                    paymentMethod === 'wallet'
                      ? 'bg-gold/20 border-gold/50 text-gold-dim shadow-xs'
                      : 'border-surface-line bg-surface-raised/30 text-slate-soft hover:text-ink-900'
                  }`}
                >
                  <Wallet size={14} />
                  <span>Wallet (₱{walletBalance.toFixed(2)})</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setPaymentMethod('cash')}
                className={`p-2 rounded-xl text-xs font-bold border transition flex flex-col items-center gap-1 cursor-pointer ${
                  paymentMethod === 'cash' || isGuest
                    ? 'bg-gold/20 border-gold/50 text-gold-dim shadow-xs'
                    : 'border-surface-line bg-surface-raised/30 text-slate-soft hover:text-ink-900'
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
