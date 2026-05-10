'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

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

type Order = {
  id: string;
  userId: string;
  productId: string;
  quantity: number;
  total: number;
  status: string;
  createdAt: Date;
};

const CheckoutPage = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const productResponse = await axios.get('/api/products');
        const orderResponse = await axios.get('/api/orders');
        setProducts(productResponse.data);
        setOrder(orderResponse.data);
      } catch (err) {
        setError('Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) return <p>Loading...</p>;
  if (error) return <p>{error}</p>;

  const handleProceedToPayment = () => {
    // Implement payment logic here
    router.push('/payment');
  };

  return (
    <div className="bg-f9f9f9 font-inter">
      <header className="bg-white shadow-sm fixed top-0 w-full z-50">
        <div className="max-w-[1280px] mx-auto px-6 h-20 flex items-center justify-between">
          <div className="font-bold text-2xl text-1a1c1c">LUXE</div>
          <nav className="hidden md:flex items-center gap-12">
            <a className="text-5f5e5e hover:text-795900 transition-colors text-base" href="#">Electronics</a>
            <a className="text-5f5e5e hover:text-795900 transition-colors text-base" href="#">Fashion</a>
            <a className="text-5f5e5e hover:text-795900 transition-colors text-base" href="#">Home</a>
            <a className="text-5f5e5e hover:text-795900 transition-colors text-base" href="#">Sports</a>
          </nav>
          <div className="flex items-center gap-6">
            <button className="material-symbols-outlined text-1a1c1c scale-95 active:scale-90 transition-transform" data-icon="shopping_cart">shopping_cart</button>
            <button className="material-symbols-outlined text-1a1c1c scale-95 active:scale-90 transition-transform" data-icon="person">person</button>
          </div>
        </div>
      </header>
      <main className="mt-20 pt-12 pb-32 px-6 max-w-[1280px] mx-auto">
        <div className="flex items-center justify-center mb-32 w-full max-w-2xl mx-auto">
          <div className="flex items-center flex-1">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-ffbf00 text-261a00 flex items-center justify-center font-bold shadow-sm">1</div>
              <span className="font-medium text-sm text-795900">Shipping</span>
            </div>
            <div className="h-[2px] flex-1 bg-e2e2e2 mx-3"></div>
          </div>
          <div className="flex items-center flex-1">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-e2e2e2 text-5f5e5e flex items-center justify-center font-bold">2</div>
              <span className="font-medium text-sm text-5f5e5e">Payment</span>
            </div>
            <div className="h-[2px] flex-1 bg-e2e2e2 mx-3"></div>
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-e2e2e2 text-5f5e5e flex items-center justify-center font-bold">3</div>
            <span className="font-medium text-sm text-5f5e5e">Review</span>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          <section className="lg:col-span-8 bg-white p-12 rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
            <h1 className="text-3xl mb-12">Shipping Details</h1>
            <form className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label className="block font-medium text-sm text-504532 mb-2">Full Name</label>
                <input className="w-full p-3 border-[1.5px] border-[#E5E5E5] rounded-lg bg-white focus:outline-none focus:border-ffbf00 focus:ring-2 focus:ring-ffbf00/20 transition-all text-base" placeholder="Johnathan Doe" type="text"/>
              </div>
              <div className="md:col-span-2">
                <label className="block font-medium text-sm text-504532 mb-2">Street Address</label>
                <input className="w-full p-3 border-[1.5px] border-[#E5E5E5] rounded-lg bg-white focus:outline-none focus:border-ffbf00 focus:ring-2 focus:ring-ffbf00/20 transition-all text-base" placeholder="123 Luxury Lane" type="text"/>
              </div>
              <div>
                <label className="block font-medium text-sm text-504532 mb-2">City</label>
                <input className="w-full p-3 border-[1.5px] border-[#E5E5E5] rounded-lg bg-white focus:outline-none focus:border-ffbf00 focus:ring-2 focus:ring-ffbf00/20 transition-all text-base" placeholder="Beverly Hills" type="text"/>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block font-medium text-sm text-504532 mb-2">State</label>
                  <input className="w-full p-3 border-[1.5px] border-[#E5E5E5] rounded-lg bg-white focus:outline-none focus:border-ffbf00 focus:ring-2 focus:ring-ffbf00/20 transition-all text-base" placeholder="CA" type="text"/>
                </div>
                <div>
                  <label className="block font-medium text-sm text-504532 mb-2">ZIP Code</label>
                  <input className="w-full p-3 border-[1.5px] border-[#E5E5E5] rounded-lg bg-white focus:outline-none focus:border-ffbf00 focus:ring-2 focus:ring-ffbf00/20 transition-all text-base" placeholder="90210" type="text"/>
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="block font-medium text-sm text-504532 mb-2">Phone Number</label>
                <input className="w-full p-3 border-[1.5px] border-[#E5E5E5] rounded-lg bg-white focus:outline-none focus:border-ffbf00 focus:ring-2 focus:ring-ffbf00/20 transition-all text-base" placeholder="+1 (555) 000-0000" type="tel"/>
              </div>
              <div className="md:col-span-2 mt-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input checked className="w-5 h-5 rounded border-5f5e5e text-795900 focus:ring-ffbf00" type="checkbox"/>
                  <span className="text-sm text-5f5e5e">Billing address is the same as shipping</span>
                </label>
              </div>
            </form>
            <div className="mt-12 flex flex-col md:flex-row items-center justify-between gap-6 border-t border-[#F0F0F0] pt-12">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-5f5e5e text-[20px]" data-icon="verified_user">verified_user</span>
                  <span className="font-normal text-xs text-5f5e5e">256-bit SSL Secure</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-5f5e5e text-[20px]" data-icon="lock">lock</span>
                  <span className="font-normal text-xs text-5f5e5e">Secure Payment</span>
                </div>
              </div>
              <button onClick={handleProceedToPayment} className="w-full md:w-auto bg-ffbf00 text-261a00 px-12 py-3 rounded-lg font-bold hover:shadow-lg transition-all active:scale-95">
                Proceed to Payment
              </button>
            </div>
          </section>
          <aside className="lg:col-span-4 sticky top-24">
            <div className="bg-white p-12 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-[#F0F0F0]">
              <h2 className="text-2xl mb-6">Order Summary</h2>
              <div className="space-y-4 mb-12">
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-lg bg-e2e2e2 overflow-hidden flex-shrink-0">
                    <img alt="Luxury Watch" className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDRWW_44-4F8hrBbSxBf46FayA6WZn29qgvvtZJ1isR2L5Md-bxvOKpNRaWzsbmKdbWilyLOETp2lNUCMS_M41j5dZfIe1x1D2oi-N-0S3AOermHK9Ptx-X4J9LZ4Nbp749HoHVVSLat1BceqDh-G7dQGGvnYfo3jPMxop8R5n0MSWS8fFv5Du3XfaM9RAW1S3Dl-t53uGEafs1cYrFxAPILUVEwwcdhbuALiNj3bDBmVmToS5op9ZP3juzH5e5ffMITm_MI2qjgjOj"/>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm text-1a1c1c line-clamp-1">Limited Edition Chronograph</p>
                    <p className="text-xs text-5f5e5e">Gold / Leather Strap</p>
                  </div>
                  <p className="font-medium text-sm text-1a1c1c">$1,250</p>
                </div>
              </div>
              <div className="space-y-4 border-t border-[#F0F0F0] pt-6 mb-6">
                <div className="flex justify-between text-sm text-5f5e5e">
                  <span>Subtotal</span>
                  <span>$1,250.00</span>
                </div>
                <div className="flex justify-between text-sm text-5f5e5e">
                  <span>Shipping</span>
                  <span className="text-795900 font-semibold">FREE</span>
                </div>
                <div className="flex justify-between text-sm text-5f5e5e">
                  <span>Tax</span>
                  <span>$100.00</span>
                </div>
              </div>
              <div className="flex justify-between items-end border-t border-[#F0F0F0] pt-6">
                <span className="text-2xl text-1a1c1c">Total</span>
                <span className="text-3xl text-795900">$1,350.00</span>
              </div>
              <div className="mt-12 p-4 bg-f3f3f4 rounded-lg flex items-start gap-3">
                <span className="material-symbols-outlined text-795900" data-icon="info">info</span>
                <p className="text-xs text-504532">
                  Returns are accepted within 30 days of purchase for a full refund. See our policy for details.
                </p>
              </div>
              <div className="mt-12 grid grid-cols-3 gap-3 items-center opacity-60 grayscale hover:grayscale-0 transition-all duration-300">
                <img alt="Visa" className="h-4 object-contain mx-auto" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDcBFCR3zTTfr3Uoh0Cm9oRRy_bRGtYw9KXI4_7Y_1UH9ynDwU4dtfzvmZLkK8pyBFXecZEACZVD95qYYM0-WKoKioTffoF-ZWT-GK1JTVL4b3EJUjKqsJnmPxVeUw1CkfHfN1lzPwMfKkJjEPvCIIbBRjbp167m7AIrhI8mSWAM7ZYBZFxzY6CV-5F78cJYi13Fb-gShXz3he78Jd06RvSAc6RHQR2dkbTt_NtmGrxJq-xYxDn7sFZX1Xr2wc0cK7sJ2ID--fEsobG"/>
                <img alt="Mastercard" className="h-8 object-contain mx-auto" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAywVKINCiS4bme31c-506FpmcNusWHQ0k913CW00BHqZJB3Hm4gN6utsFAyosCGHVyKsN9xRJ8yE7DypoYloZX2TBpCfqA63W5Hs67nAgzrnMbyIioKMrXD74TZ5KIfsxy6h7Udk1-HPnVD17k5zh_YSiDD3pRZGEWUgrAMTcbwhxTON4IwWvUHpKrKqxHiwIwLpbaMB7SBg3BN06HXEzryQMwBbx28v58vnyDELqHZgUFBhjoiB7KgEgnVTpZ1PWdR8i2h0s8v8wX"/>
                <img alt="Paypal" className="h-5 object-contain mx-auto" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDQbLHniJMPW9lvS--c_PY8FXOhw9UEGZ9YQV-7P0gKcu2Urw7iP6iiQhAuBDtMUtnz-4A6upBiDzWP50wSobpzgZa8uatLV4iPNRCCkLRWHxhfmEbNeXultzWQwjA1tcZdMjhVTclAcDUgJ4m6wfFZwHq3XYFoN2qWodfjdMPLVj51PGer8HvPertgddbwppvpSm7tXs9p6uZayEf1bwO7FaIPu8kb80ppBPczyDGz9dEGRCfNL88oR-sOPto9DzbD4whugv9KETUG"/>
              </div>
            </div>
          </aside>
        </div>
      </main>
      <footer className="bg-f3f3f4 border-t border-e2e2e2">
        <div className="max-w-[1280px] mx-auto px-6 py-32 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="font-bold text-2xl text-1a1c1c">LUXE</div>
          <div className="flex flex-wrap justify-center gap-6">
            <a className="text-sm text-5f5e5e hover:text-795900 underline transition-all" href="#">About Us</a>
            <a className="text-sm text-5f5e5e hover:text-795900 underline transition-all" href="#">Shipping</a>
            <a className="text-sm text-5f5e5e hover:text-795900 underline transition-all" href="#">Returns</a>
            <a className="text-sm text-5f5e5e hover:text-795900 underline transition-all" href="#">Terms of Service</a>
            <a className="text-sm text-5f5e5e hover:text-795900 underline transition-all" href="#">Privacy Policy</a>
            <a className="text-sm text-5f5e5e hover:text-795900 underline transition-all" href="#">Contact</a>
          </div>
          <p className="text-sm text-e2e2e2">© 2024 LUXE Boutique. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default CheckoutPage;