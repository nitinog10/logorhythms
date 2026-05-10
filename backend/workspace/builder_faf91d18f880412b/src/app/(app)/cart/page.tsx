'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/router';

type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  imageUrl: string;
  rating: number;
  reviews: number;
};

type CartItem = {
  product: Product;
  quantity: number;
  total: number;
};

const CartPage = () => {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [couponCode, setCouponCode] = useState('');
  const [subtotal, setSubtotal] = useState(0);
  const [tax, setTax] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    const fetchCartItems = async () => {
      try {
        const response = await axios.get('/api/cart');
        setCartItems(response.data);
        calculateTotals(response.data);
        setLoading(false);
      } catch (err) {
        setError('Failed to load cart items');
        setLoading(false);
      }
    };

    fetchCartItems();
  }, []);

  const calculateTotals = (items: CartItem[]) => {
    const subtotal = items.reduce((acc, item) => acc + item.total, 0);
    const tax = subtotal * 0.08;
    const total = subtotal + tax;
    setSubtotal(subtotal);
    setTax(tax);
    setTotal(total);
  };

  const handleQuantityChange = (productId: string, newQuantity: number) => {
    const updatedCartItems = cartItems.map(item =>
      item.product.id === productId? {...item, quantity: newQuantity, total: item.product.price * newQuantity } : item
    );
    setCartItems(updatedCartItems);
    calculateTotals(updatedCartItems);
  };

  const handleRemoveItem = (productId: string) => {
    const updatedCartItems = cartItems.filter(item => item.product.id!== productId);
    setCartItems(updatedCartItems);
    calculateTotals(updatedCartItems);
  };

  const handleApplyCoupon = async () => {
    try {
      const response = await axios.post('/api/apply-coupon', { code: couponCode });
      setTax(response.data.tax);
      setTotal(response.data.total);
    } catch (err) {
      setError('Failed to apply coupon');
    }
  };

  const handleCheckout = () => {
    router.push('/checkout');
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div>{error}</div>;

  return (
    <div className="max-w-[1280px] mx-auto px-6 pt-20 pb-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Your Shopping Cart</h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {cartItems.map(item => (
            <div key={item.product.id} className="bg-white rounded-lg shadow-sm p-4">
              <div className="flex flex-col md:flex-row items-center md:items-start gap-4 border-b border-gray-200 pb-4">
                <img src={item.product.imageUrl} alt={item.product.name} className="w-32 h-32 object-cover rounded" />
                <div className="flex-grow space-y-2">
                  <h3 className="text-xl font-bold text-gray-900">{item.product.name}</h3>
                  <p className="text-sm text-gray-600">Color: Midnight Black</p>
                  <p className="text-xl font-bold text-yellow-600">${item.product.price.toFixed(2)}</p>
                </div>
                <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                  <div className="flex items-center border border-gray-300 rounded-lg bg-white">
                    <button onClick={() => handleQuantityChange(item.product.id, item.quantity - 1)} className="p-2 text-gray-600 hover:text-yellow-600">-</button>
                    <span className="px-4 font-medium text-gray-900">{item.quantity}</span>
                    <button onClick={() => handleQuantityChange(item.product.id, item.quantity + 1)} className="p-2 text-gray-600 hover:text-yellow-600">+</button>
                  </div>
                  <div className="text-right flex flex-col items-end">
                    <p className="text-sm text-gray-500 mb-1">Total: ${item.total.toFixed(2)}</p>
                    <button onClick={() => handleRemoveItem(item.product.id)} className="text-red-600 hover:opacity-80">Delete</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <aside className="lg:col-span-1 space-y-4">
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 sticky top-20">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Order Summary</h2>
            <div className="space-y-2 pb-4 border-b border-gray-200">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Shipping Estimate</span>
                <span>$0.00</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Tax</span>
                <span>${tax.toFixed(2)}</span>
              </div>
            </div>
            <div className="py-4">
              <label className="text-sm text-gray-600 block mb-2">Coupon Code</label>
              <div className="flex gap-2">
                <input value={couponCode} onChange={e => setCouponCode(e.target.value)} className="flex-grow bg-white border border-gray-300 rounded-lg px-4 py-2 focus:border-yellow-600 focus:ring-1 focus:ring-yellow-600" placeholder="Enter code" type="text" />
                <button onClick={handleApplyCoupon} className="bg-gray-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-gray-700">Apply</button>
              </div>
            </div>
            <div className="pt-4 border-t border-gray-200 mb-4">
              <div className="flex justify-between items-end">
                <span className="text-2xl font-bold text-gray-900">Total</span>
                <span className="text-4xl font-bold text-yellow-600">${total.toFixed(2)}</span>
              </div>
            </div>
            <button onClick={handleCheckout} className="w-full bg-yellow-600 text-white font-medium py-3 rounded-lg shadow-sm hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2">
              Proceed to Checkout
              <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </button>
            <div className="mt-4 flex items-center justify-center gap-2 text-gray-600">
              <span className="material-symbols-outlined text-[16px]">lock</span>
              <span className="text-sm">Secure Checkout Guaranteed</span>
            </div>
          </div>
          <div className="bg-gray-100 p-4 rounded-lg">
            <h4 className="text-sm font-medium text-gray-900 mb-2">Need Help?</h4>
            <p className="text-sm text-gray-600 mb-2">Our luxury concierges are available 24/7 to assist with your order.</p>
            <a href="#" className="text-yellow-600 font-medium underline hover:text-yellow-700">Contact Support</a>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default CartPage;