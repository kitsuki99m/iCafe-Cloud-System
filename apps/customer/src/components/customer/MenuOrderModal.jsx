import { useState, useEffect } from 'react'
import { X, UtensilsCrossed, Plus, Minus, ShoppingBag, Wallet, DollarSign, CheckCircle2, AlertCircle } from 'lucide-react'
import { useAppData } from '../../context/AppDataContext.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { showToast } from '../../lib/toast.js'
import Button from '../common/Button.jsx'

const CATEGORIES = ['All', 'Food', 'Drinks', 'Snacks', 'Combos']

export default function MenuOrderModal({ isOpen, onClose }) {
  const { menuItems, placeMenuOrder, currentMember } = useAppData()
  const { user } = useAuth()
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [cart, setCart] = useState({}) // { [itemId]: { item, quantity } }
  const [paymentMethod, setPaymentMethod] = useState('wallet') // 'wallet' | 'cash'
  const [submitting, setSubmitting] = useState(false)

  const walletBalance = Number(currentMember?.wallet || currentMember?.walletBalance || 0)
  const isGuest = user?.role === 'guest'

  // If guest, default to cash payment
  useEffect(() => {
    if (isGuest) setPaymentMethod('cash')
  }, [isGuest])

  if (!isOpen) return null

  const filteredItems = menuItems.filter(
    (item) => {
      const isAvail = item.is_available !== undefined ? Boolean(item.is_available) : Boolean(item.isAvailable)
      if (!isAvail) return false
      return selectedCategory === 'All' || item.category?.toLowerCase() === selectedCategory.toLowerCase()
    }
  )

  const cartItems = Object.values(cart)
  const totalAmount = cartItems.reduce((acc, { item, quantity }) => acc + Number(item.price || 0) * quantity, 0)
  const canPayWallet = !isGuest && walletBalance >= totalAmount

  function addToCart(item) {
    setCart((curr) => {
      const existing = curr[item.id]
      const quantity = existing ? existing.quantity + 1 : 1
      return { ...curr, [item.id]: { item, quantity } }
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

  async function handleCheckout(e) {
    e.preventDefault()
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
          ? `₱${totalAmount.toFixed(2)} debited from wallet. Preparing your order!`
          : `Order sent! Please prepare ₱${totalAmount.toFixed(2)} for the counter staff.`,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col md:flex-row max-h-[90vh]">
        {/* Left Side: Catalog */}
        <div className="flex-1 flex flex-col min-h-0 border-b md:border-b-0 md:border-r border-slate-800">
          {/* Header */}
          <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <UtensilsCrossed className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Order Snacks & Drinks</h2>
                <p className="text-xs text-slate-400">Delivered directly to your station</p>
              </div>
            </div>
            <button onClick={onClose} className="md:hidden text-slate-400 hover:text-white p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Categories */}
          <div className="p-3 bg-slate-900/60 border-b border-slate-800 flex gap-2 overflow-x-auto">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                  selectedCategory === cat
                    ? 'bg-amber-500 text-slate-950 shadow-md'
                    : 'bg-slate-800/80 text-slate-400 hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Item Grid */}
          <div className="p-4 overflow-y-auto flex-1 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filteredItems.length === 0 ? (
              <div className="col-span-full py-12 text-center text-slate-500 text-xs">
                No items available in this category.
              </div>
            ) : (
              filteredItems.map((item) => {
                const inCart = cart[item.id]?.quantity || 0
                return (
                  <div
                    key={item.id}
                    className="bg-slate-950/60 border border-slate-800 rounded-2xl p-3 flex flex-col justify-between hover:border-slate-700 transition"
                  >
                    <div>
                      <div className="h-24 rounded-xl bg-slate-800 overflow-hidden relative mb-2 flex items-center justify-center">
                        {item.image_url || item.imageUrl ? (
                          <img src={item.image_url || item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <UtensilsCrossed className="w-8 h-8 text-slate-600" />
                        )}
                        <span className="absolute top-1 right-1 text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-slate-950/80 text-amber-400">
                          ₱{Number(item.price).toFixed(2)}
                        </span>
                      </div>
                      <h4 className="font-bold text-xs text-white truncate">{item.name}</h4>
                      {item.description && (
                        <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">{item.description}</p>
                      )}
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      {inCart > 0 ? (
                        <div className="flex items-center gap-2 bg-slate-800 rounded-lg px-2 py-1">
                          <button onClick={() => removeFromCart(item.id)} className="text-slate-400 hover:text-white">
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-xs font-bold text-amber-400">{inCart}</span>
                          <button onClick={() => addToCart(item)} className="text-slate-400 hover:text-white">
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => addToCart(item)}
                          className="w-full py-1.5 px-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition flex items-center justify-center gap-1"
                        >
                          <Plus className="w-3 h-3" /> Add
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Right Side: Cart & Checkout */}
        <div className="w-full md:w-80 bg-slate-950 flex flex-col justify-between">
          <div className="p-5 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-amber-400" /> Your Order ({cartItems.length})
            </h3>
            <button onClick={onClose} className="hidden md:block text-slate-400 hover:text-white p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 overflow-y-auto flex-1 space-y-2">
            {cartItems.length === 0 ? (
              <div className="py-12 text-center text-slate-600 text-xs">
                Your cart is empty. Click + Add on any menu item to start ordering.
              </div>
            ) : (
              cartItems.map(({ item, quantity }) => (
                <div key={item.id} className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                  <div className="min-w-0 pr-2">
                    <h5 className="font-bold text-xs text-white truncate">{item.name}</h5>
                    <span className="text-[10px] text-slate-400 font-mono">
                      ₱{Number(item.price).toFixed(2)} × {quantity}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => removeFromCart(item.id)} className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white">
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-xs font-bold text-white font-mono">{quantity}</span>
                    <button onClick={() => addToCart(item)} className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white">
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Checkout section */}
          <div className="p-5 border-t border-slate-800 bg-slate-900/60 space-y-4">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1.5">Payment Method</label>
              <div className="grid grid-cols-2 gap-2">
                {!isGuest && (
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('wallet')}
                    className={`py-2 px-2.5 rounded-xl text-xs font-bold border transition flex flex-col items-center gap-1 ${
                      paymentMethod === 'wallet'
                        ? 'bg-amber-500/10 border-amber-500/60 text-amber-400'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Wallet className="w-4 h-4" />
                    <span>Wallet (₱{walletBalance.toFixed(2)})</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPaymentMethod('cash')}
                  className={`py-2 px-2.5 rounded-xl text-xs font-bold border transition flex flex-col items-center gap-1 ${
                    paymentMethod === 'cash' || isGuest
                      ? 'bg-amber-500/10 border-amber-500/60 text-amber-400'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <DollarSign className="w-4 h-4" />
                  <span>Cash at Counter</span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <span className="text-xs font-medium text-slate-400">Total Due:</span>
              <span className="text-xl font-black text-amber-400 font-mono">
                ₱{totalAmount.toFixed(2)}
              </span>
            </div>

            <Button
              onClick={handleCheckout}
              disabled={submitting || cartItems.length === 0}
              className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm rounded-xl shadow-lg shadow-amber-500/10 transition"
            >
              {submitting ? 'Placing Order…' : 'Place Order Now'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
