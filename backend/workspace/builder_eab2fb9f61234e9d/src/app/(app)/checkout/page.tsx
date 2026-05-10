'use client';

import { useState, useEffect } from'react';
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

type Order = {
  id: string;
  userId: string;
  products: Product[];
  total: number;
  status: string;
  createdAt: Date;
};

const CheckoutPage = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await axios.get('/api/products');
        setProducts(response.data);
        setLoading(false);
      } catch (err) {
        setError('Failed to fetch products');
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  const handlePlaceOrder = () => {
    // Implement order placement logic here
    console.log('Order placed:', order);
  };

  if (loading) return <p>Loading...</p>;
  if (error) return <p>{error}</p>;

  return (
    <div className="bg-surface">
      <header className="bg-surface dark:bg-surface-dim shadow-sm dark:shadow-none docked full-width top-0 sticky z-50">
        <div className="flex justify-between items-center px-lg h-20 w-full max-w-container-max mx-auto">
          <span className="font-h3 text-h3 text-primary dark:text-primary-fixed">GlowSkin</span>
          <nav className="hidden md:flex items-center gap-lg">
            <div className="flex items-center gap-xs text-primary font-bold border-b-2 border-primary pb-1 font-body-md text-body-md">
              <span className="w-5 h-5 rounded-full bg-primary text-on-primary flex items-center justify-center text-[10px]">1</span>
              Shipping
            </div>
            <div className="h-[1px] w-8 bg-outline-variant"></div>
            <div className="flex items-center gap-xs text-secondary dark:text-secondary-fixed-dim font-body-md text-body-md">
              <span className="w-5 h-5 rounded-full border border-outline-variant flex items-center justify-center text-[10px]">2</span>
              Payment
            </div>
            <div className="h-[1px] w-8 bg-outline-variant"></div>
            <div className="flex items-center gap-xs text-secondary dark:text-secondary-fixed-dim font-body-md text-body-md">
              <span className="w-5 h-5 rounded-full border border-outline-variant flex items-center justify-center text-[10px]">3</span>
              Review
            </div>
          </nav>
          <div className="flex items-center gap-md">
            <span className="material-symbols-outlined text-primary" data-icon="lock">lock</span>
          </div>
        </div>
      </header>
      <main className="max-w-container-max mx-auto px-lg py-xl">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-xl">
          <div className="lg:col-span-7 space-y-xl">
            <section>
              <h2 className="font-h2 text-h2 mb-lg text-primary">Shipping Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
                <div className="md:col-span-2">
                  <label className="block font-label-sm text-label-sm text-secondary uppercase mb-xs">Full Name</label>
                  <input className="w-full bg-surface-container-low border border-secondary-fixed rounded-xl px-md py-sm font-body-md text-body-md" placeholder="Aris Thorne" type="text"/>
                </div>
                <div className="md:col-span-2">
                  <label className="block font-label-sm text-label-sm text-secondary uppercase mb-xs">Street Address</label>
                  <input className="w-full bg-surface-container-low border border-secondary-fixed rounded-xl px-md py-sm font-body-md text-body-md" placeholder="123 Serenity Lane" type="text"/>
                </div>
                <div>
                  <label className="block font-label-sm text-label-sm text-secondary uppercase mb-xs">City</label>
                  <input className="w-full bg-surface-container-low border border-secondary-fixed rounded-xl px-md py-sm font-body-md text-body-md" placeholder="Evergreen" type="text"/>
                </div>
                <div>
                  <label className="block font-label-sm text-label-sm text-secondary uppercase mb-xs">Postal Code</label>
                  <input className="w-full bg-surface-container-low border border-secondary-fixed rounded-xl px-md py-sm font-body-md text-body-md" placeholder="90210" type="text"/>
                </div>
                <div className="md:col-span-2">
                  <label className="block font-label-sm text-label-sm text-secondary uppercase mb-xs">Phone Number</label>
                  <input className="w-full bg-surface-container-low border border-secondary-fixed rounded-xl px-md py-sm font-body-md text-body-md" placeholder="+1 (555) 000-0000" type="tel"/>
                </div>
              </div>
            </section>
            <div className="h-[1px] bg-outline-variant opacity-30"></div>
            <section>
              <div className="flex justify-between items-center mb-lg">
                <h2 className="font-h2 text-h2 text-primary">Billing Address</h2>
                <div className="flex items-center gap-sm">
                  <input checked className="rounded border-outline text-primary focus:ring-primary" id="same-as-shipping" type="checkbox"/>
                  <label className="font-body-md text-body-md text-secondary" htmlFor="same-as-shipping">Same as shipping</label>
                </div>
              </div>
            </section>
            <div className="h-[1px] bg-outline-variant opacity-30"></div>
            <section>
              <h2 className="font-h2 text-h2 mb-lg text-primary">Secure Payment</h2>
              <div className="bg-surface-container-low p-lg rounded-xl border border-secondary-fixed">
                <div className="flex items-center gap-md mb-lg">
                  <div className="flex-1 flex items-center gap-sm border-b-2 border-primary pb-sm">
                    <span className="material-symbols-outlined text-primary" data-icon="credit_card">credit_card</span>
                    <span className="font-body-md text-body-md text-primary font-bold">Credit Card</span>
                  </div>
                  <div className="flex-1 flex items-center gap-sm pb-sm opacity-50">
                    <span className="material-symbols-outlined text-secondary" data-icon="account_balance_wallet">account_balance_wallet</span>
                    <span className="font-body-md text-body-md text-secondary">PayPal</span>
                  </div>
                </div>
                <div className="space-y-gutter">
                  <div>
                    <label className="block font-label-sm text-label-sm text-secondary uppercase mb-xs">Card Number</label>
                    <div className="relative">
                      <input className="w-full bg-surface-container-lowest border border-secondary-fixed rounded-xl px-md py-sm font-body-md text-body-md" placeholder="0000 0000 0000 0000" type="text"/>
                      <div className="absolute right-md top-1/2 -translate-y-1/2 flex gap-xs">
                        <span className="material-symbols-outlined text-secondary-fixed-dim" data-icon="credit_card_heart">credit_card_heart</span>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-gutter">
                    <div>
                      <label className="block font-label-sm text-label-sm text-secondary uppercase mb-xs">Expiry Date</label>
                      <input className="w-full bg-surface-container-lowest border border-secondary-fixed rounded-xl px-md py-sm font-body-md text-body-md" placeholder="MM/YY" type="text"/>
                    </div>
                    <div>
                      <label className="block font-label-sm text-label-sm text-secondary uppercase mb-xs">CVV</label>
                      <input className="w-full bg-surface-container-lowest border border-secondary-fixed rounded-xl px-md py-sm font-body-md text-body-md" placeholder="123" type="text"/>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
          <div className="lg:col-span-5">
            <aside className="sticky top-28 bg-surface-container p-lg rounded-xl shadow-sm">
              <h3 className="font-h3 text-h3 text-primary mb-xl">Order Summary</h3>
              <div className="space-y-lg mb-xl">
                {products.map((product) => (
                  <div key={product.id} className="flex gap-md">
                    <div className="w-20 h-24 bg-surface-container-highest rounded-lg overflow-hidden flex-shrink-0">
                      <img className="w-full h-full object-cover" src={product.image} alt={product.name} />
                    </div>
                    <div className="flex-1 flex flex-col justify-between py-xs">
                      <div>
                        <h4 className="font-body-md text-body-md font-bold text-primary">{product.name}</h4>
                        <p className="font-label-sm text-label-sm text-secondary">{product.description}</p>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-body-md text-body-md text-secondary">Qty: 1</span>
                        <span className="font-body-md text-body-md font-bold text-primary">${product.price.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="h-[1px] bg-outline-variant opacity-30 mb-lg"></div>
              <div className="space-y-sm mb-xl">
                <div className="flex justify-between font-body-md text-body-md text-secondary">
                  <span>Subtotal</span>
                  <span>${products.reduce((acc, product) => acc + product.price, 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-body-md text-body-md text-secondary">
                  <span>Shipping</span>
                  <span>$0.00</span>
                </div>
                <div className="flex justify-between font-body-md text-body-md text-secondary">
                  <span>Estimated Tax</span>
                  <span>$12.41</span>
                </div>
                <div className="flex justify-between font-h3 text-h3 text-primary pt-md">
                  <span>Total</span>
                  <span className="font-bold">${(products.reduce((acc, product) => acc + product.price, 0) + 12.41).toFixed(2)}</span>
                </div>
              </div>
              <button onClick={handlePlaceOrder} className="w-full bg-primary text-on-primary py-lg rounded-xl font-body-md font-bold hover:bg-primary-container transition-colors duration-300 flex items-center justify-center gap-sm scale-95 active:scale-90 transition-transform">
                <span className="material-symbols-outlined text-on-primary" data-icon="verified_user">verified_user</span>
                Place Order
              </button>
              <p className="text-center font-label-sm text-label-sm text-secondary mt-md flex items-center justify-center gap-xs">
                <span className="material-symbols-outlined text-[14px]" data-icon="lock_person">lock_person</span>
                Secure &amp; Encrypted Checkout
              </p>
            </aside>
          </div>
        </div>
      </main>
      <footer className="w-full py-xl px-lg flex flex-col md:flex-row justify-between items-center gap-md bg-surface-container-low dark:bg-tertiary-container mt-xl">
        <div className="flex flex-col md:flex-row items-center gap-lg">
          <span className="font-h3 text-h3 text-primary">GlowSkin</span>
          <p className="font-label-sm text-label-sm text-secondary dark:text-secondary-fixed-dim">© 2024 GlowSkin. Secure &amp; Encrypted Checkout.</p>
        </div>
        <nav className="flex gap-lg">
          <a className="font-label-sm text-label-sm text-secondary hover:underline transition-colors" href="#">Privacy Policy</a>
          <a className="font-label-sm text-label-sm text-secondary hover:underline transition-colors" href="#">Terms of Service</a>
          <a className="font-label-sm text-label-sm text-secondary hover:underline transition-colors" href="#">Help Center</a>
        </nav>
      </footer>
    </div>
  );
};

export default CheckoutPage;