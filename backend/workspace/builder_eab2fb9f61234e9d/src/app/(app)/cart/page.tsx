'use client';

import { useEffect, useState } from'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

type Product = {
  id: string;
  name: string;
  price: number;
  description: string;
  category: string;
  brand: string;
  rating: number;
};

type CartItem = Product & {
  quantity: number;
};

const CartPage = () => {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const fetchCartItems = async () => {
      try {
        const response = await axios.get('/api/cart');
        setCartItems(response.data);
        setLoading(false);
      } catch (err) {
        setError('Failed to load cart items');
        setLoading(false);
      }
    };

    fetchCartItems();
  }, []);

  const handleQuantityChange = async (productId: string, newQuantity: number) => {
    try {
      const response = await axios.put('/api/cart', { productId, quantity: newQuantity });
      setCartItems(response.data);
    } catch (err) {
      setError('Failed to update quantity');
    }
  };

  const handleRemoveItem = async (productId: string) => {
    try {
      const response = await axios.delete('/api/cart', { data: { productId } });
      setCartItems(response.data);
    } catch (err) {
      setError('Failed to remove item');
    }
  };

  const handleContinueShopping = () => {
    router.push('/shop');
  };

  const handleProceedToCheckout = () => {
    router.push('/checkout');
  };

  if (loading) return <p>Loading...</p>;
  if (error) return <p>{error}</p>;

  return (
    <div className="bg-background text-on-surface min-h-screen">
      <header className="bg-surface dark:bg-tertiary-container sticky top-0 z-40 transition-shadow">
        <div className="flex justify-between items-center px-gutter w-full h-20 max-w-container-max mx-auto">
          <div className="flex items-center gap-4">
            <button className="active:opacity-80 transition-opacity flex items-center">
              <span className="material-symbols-outlined text-primary dark:text-primary-fixed-dim" data-icon="arrow_back">arrow_back</span>
            </button>
            <h1 className="font-h3 text-h3 text-primary dark:text-primary-fixed-dim">Your Shopping Cart</h1>
          </div>
          <div className="hidden md:flex gap-8 items-center">
            <span className="text-secondary dark:on-secondary-container font-label-sm text-label-sm uppercase tracking-widest hover:text-on-surface-variant transition-colors duration-200 cursor-pointer">Shop</span>
            <span className="text-secondary dark:on-secondary-container font-label-sm text-label-sm uppercase tracking-widest hover:text-on-surface-variant transition-colors duration-200 cursor-pointer">Rituals</span>
            <span className="text-primary dark:text-primary-fixed-dim font-bold font-label-sm text-label-sm uppercase tracking-widest transition-colors duration-200 cursor-pointer">Cart</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="material-symbols-outlined text-primary dark:text-primary-fixed-dim cursor-pointer active:opacity-80" data-icon="person">person</span>
          </div>
        </div>
      </header>
      <main className="max-w-container-max mx-auto px-gutter py-xl">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-xl">
          <div className="lg:col-span-8 space-y-md">
            <h2 className="font-h2 text-h2 mb-lg">Your Selection</h2>
            {cartItems.map((item) => (
              <div key={item.id} className="flex flex-col sm:flex-row items-center gap-lg p-md bg-surface-container-low rounded-xl shadow-[0_4px_24px_rgba(27,48,34,0.02)] transition-all hover:shadow-[0_4px_32px_rgba(27,48,34,0.06)] group">
                <div className="w-full sm:w-40 aspect-[4/5] overflow-hidden rounded-lg bg-surface-container-highest">
                  <img alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" src={item.image} />
                </div>
                <div className="flex-grow space-y-sm">
                  <div className="flex justify-between items-start">
                    <h3 className="font-h3 text-h3 text-primary">{item.name}</h3>
                    <p className="font-body-lg text-body-lg text-primary">${item.price.toFixed(2)}</p>
                  </div>
                  <p className="font-body-md text-body-md text-secondary">{item.description}</p>
                  <div className="flex items-center justify-between pt-md">
                    <div className="flex items-center border border-outline-variant rounded-lg bg-surface-container-lowest">
                      <button onClick={() => handleQuantityChange(item.id, item.quantity - 1)} className="px-md py-sm text-secondary hover:text-primary active:scale-95 transition-all">
                        <span className="material-symbols-outlined text-[20px]" data-icon="remove">remove</span>
                      </button>
                      <span className="px-md font-body-md text-body-md text-primary">{item.quantity}</span>
                      <button onClick={() => handleQuantityChange(item.id, item.quantity + 1)} className="px-md py-sm text-secondary hover:text-primary active:scale-95 transition-all">
                        <span className="material-symbols-outlined text-[20px]" data-icon="add">add</span>
                      </button>
                    </div>
                    <button onClick={() => handleRemoveItem(item.id)} className="flex items-center gap-xs font-label-sm text-label-sm text-on-surface-variant hover:text-error transition-colors">
                      <span className="material-symbols-outlined text-[18px]" data-icon="delete">delete</span>
                      <span>Remove</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
            <div className="pt-lg">
              <button onClick={handleContinueShopping} className="flex items-center gap-sm font-label-sm text-label-sm text-primary group">
                <span className="material-symbols-outlined group-hover:-translate-x-1 transition-transform" data-icon="arrow_back">arrow_back</span>
                <span className="uppercase tracking-widest border-b border-primary pb-1">Continue Shopping</span>
              </button>
            </div>
          </div>
          <div className="lg:col-span-4">
            <div className="sticky top-28 p-lg bg-secondary-container rounded-xl space-y-lg shadow-sm">
              <h3 className="font-h3 text-h3 text-primary">Order Summary</h3>
              <div className="space-y-md">
                <div className="flex justify-between font-body-md text-body-md text-secondary">
                  <span>Subtotal</span>
                  <span>${cartItems.reduce((acc, item) => acc + item.price * item.quantity, 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-body-md text-body-md text-secondary">
                  <span>Estimated Tax</span>
                  <span>${(cartItems.reduce((acc, item) => acc + item.price * item.quantity, 0) * 0.08).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-body-md text-body-md text-secondary pb-md border-b border-outline-variant">
                  <span>Shipping</span>
                  <span className="text-on-primary-container italic">Complimentary</span>
                </div>
                <div className="flex justify-between font-h3 text-h3 text-primary pt-sm">
                  <span>Total</span>
                  <span>${(cartItems.reduce((acc, item) => acc + item.price * item.quantity, 0) * 1.08).toFixed(2)}</span>
                </div>
              </div>
              <div className="space-y-md pt-md">
                <button onClick={handleProceedToCheckout} className="w-full py-md bg-primary text-on-primary rounded-xl font-label-sm text-label-sm uppercase tracking-widest hover:opacity-90 active:scale-[0.98] transition-all">
                  Proceed to Checkout
                </button>
                <p className="text-center font-label-sm text-[10px] text-on-secondary-container uppercase tracking-tighter opacity-70">
                  Secure Checkout Powered by GlowSkin
                </p>
              </div>
              <div className="pt-lg border-t border-outline-variant space-y-sm">
                <p className="font-label-sm text-label-sm text-primary flex items-center gap-sm">
                  <span className="material-symbols-outlined text-[18px]" data-icon="eco">eco</span>
                  Eco-Friendly Packaging
                </p>
                <p className="font-label-sm text-label-sm text-primary flex items-center gap-sm">
                  <span className="material-symbols-outlined text-[18px]" data-icon="verified">verified</span>
                  Two-Year Freshness Guarantee
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
      <nav className="md:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 py-4 bg-surface dark:bg-tertiary-container shadow-[0_-4px_24px_rgba(27,48,34,0.04)]">
        <div className="flex flex-col items-center justify-center text-secondary dark:text-on-secondary-container hover:opacity-80 transition-opacity active:scale-95 duration-200">
          <span className="material-symbols-outlined" data-icon="spa">spa</span>
          <span className="font-label-sm text-label-sm uppercase tracking-widest mt-1">Shop</span>
        </div>
        <div className="flex flex-col items-center justify-center text-secondary dark:text-on-secondary-container hover:opacity-80 transition-opacity active:scale-95 duration-200">
          <span className="material-symbols-outlined" data-icon="auto_awesome">auto_awesome</span>
          <span className="font-label-sm text-label-sm uppercase tracking-widest mt-1">Rituals</span>
        </div>
        <div className="flex flex-col items-center justify-center text-primary dark:text-primary-fixed-dim font-bold hover:opacity-80 transition-opacity active:scale-95 duration-200">
          <span className="material-symbols-outlined" data-icon="shopping_bag" style={{ fontVariationSettings: "'FILL' 1" }}>shopping_bag</span>
          <span className="font-label-sm text-label-sm uppercase tracking-widest mt-1">Cart</span>
        </div>
        <div className="flex flex-col items-center justify-center text-secondary dark:text-on-secondary-container hover:opacity-80 transition-opacity active:scale-95 duration-200">
          <span className="material-symbols-outlined" data-icon="person">person</span>
          <span className="font-label-sm text-label-sm uppercase tracking-widest mt-1">Profile</span>
        </div>
      </nav>
    </div>
  );
};

export default CartPage;