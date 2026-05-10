'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';

type Product = {
  id: string;
  name: string;
  price: number;
  description: string;
  category: string;
  brand: string;
  rating: number;
};

const HomePage = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await axios.get('/api/products');
        setProducts(response.data);
        setLoading(false);
      } catch (err) {
        setError('Failed to load products');
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>{error}</div>;

  return (
    <div className="bg-fbf9f5">
      <header className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-6 py-4 max-w-7xl mx-auto bg-white/80 backdrop-blur-md">
        <div className="flex items-center gap-10 w-full max-w-7xl mx-auto">
          <div className="font-serif text-3xl text-061b0e">GlowSkin</div>
          <div className="hidden md:flex flex-1 max-w-xl relative">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-737973">search</span>
            <input className="w-full bg-efeeea border-none rounded-xl py-3 pl-12 pr-4 text-base focus:ring-1 focus:ring-1b3022 outline-none placeholder:text-434843/50" placeholder="Search rituals, ingredients, or products..." type="text"/>
          </div>
          <div className="flex items-center gap-6">
            <button className="text-061b0e hover:text-4d6453 transition-colors">
              <span className="material-symbols-outlined">shopping_cart</span>
            </button>
            <button className="text-061b0e hover:text-4d6453 transition-colors">
              <span className="material-symbols-outlined">account_circle</span>
            </button>
            <button className="md:hidden text-061b0e">
              <span className="material-symbols-outlined">menu</span>
            </button>
          </div>
        </div>
      </header>
      <main className="pt-24 pb-32">
        <section className="px-6 mb-10">
          <div className="relative w-full aspect-[21/9] rounded-xl overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-r from-black/20 to-transparent z-10"></div>
            <img className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuC-8x1IpmjhiKxrsM-WaxJ-lpHVh7UzSuBQOdCpMwQQ4522xGYo5U2bciJTJtgLaP0z0E7GJ_DyyQWmwl72MG9vlNX3RBcAPy4owWQdtz8A2I_YxP2_nJwHVx-9uyQm9AcakB0iti1O6T96Vc_u3pSBXeLgGHxBHTvJUdxuzj5AHrSU2A3BjzPL-TCwuEcYe0_L_X_2rWnpGC-phiBWchqH4AxM8zlciKevfbkM6GsD1Avk-i8Ud8RCcQUppzxi_C3fE7Mja2xIoEXD" alt="Summer Collection"/>
            <div className="absolute inset-0 z-20 flex flex-col justify-center px-12 md:px-24">
              <span className="uppercase tracking-[0.2em] mb-4 text-efeeea">Summer Collection</span>
              <h1 className="text-48px leading-1.2 -tracking-0.02em font-light text-061b0e mb-6 max-w-xl">Summer Glow Essentials</h1>
              <p className="text-base leading-1.6 text-061b0e/90 mb-8 max-w-md">Curated botanical infusions designed to protect and illuminate your skin during the golden hour.</p>
              <div>
                <button className="bg-061b0e text-fbf9f5 px-8 py-4 rounded-xl font-base hover:bg-1b3022 transition-all">Shop the Ritual</button>
              </div>
            </div>
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex gap-3">
              <div className="w-12 h-1 bg-efeeea rounded-full"></div>
              <div className="w-12 h-1 bg-efeeea/30 rounded-full"></div>
              <div className="w-12 h-1 bg-efeeea/30 rounded-full"></div>
            </div>
          </div>
        </section>
        <section className="px-6 mb-6 sticky top-20 z-40 bg-white/95 backdrop-blur-sm py-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-efeeea pb-6">
            <div className="flex gap-4 overflow-x-auto hide-scrollbar">
              <button className="bg-1b3022 text-fbf9f5 px-6 py-2 rounded-full font-sm whitespace-nowrap">All Products</button>
              <button className="bg-efeeea text-434843 hover:bg-eae8e4 transition-all px-6 py-2 rounded-full font-sm whitespace-nowrap">Cleansers</button>
              <button className="bg-efeeea text-434843 hover:bg-eae8e4 transition-all px-6 py-2 rounded-full font-sm whitespace-nowrap">Serums</button>
              <button className="bg-efeeea text-434843 hover:bg-eae8e4 transition-all px-6 py-2 rounded-full font-sm whitespace-nowrap">Moisturizers</button>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative">
                <select className="appearance-none bg-transparent border-none text-sm font-sm pr-8 py-2 focus:ring-0 cursor-pointer">
                  <option>Skin Type</option>
                  <option>Dry</option>
                  <option>Oily</option>
                  <option>Combination</option>
                </select>
                <span className="material-symbols-outlined absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-737973 text-sm">expand_more</span>
              </div>
              <div className="w-px h-4 bg-c3c8c1"></div>
              <div className="relative">
                <select className="appearance-none bg-transparent border-none text-sm font-sm pr-8 py-2 focus:ring-0 cursor-pointer">
                  <option>Price Range</option>
                  <option>Under $50</option>
                  <option>$50 - $100</option>
                  <option>$100+</option>
                </select>
                <span className="material-symbols-outlined absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-737973 text-sm">expand_more</span>
              </div>
            </div>
          </div>
        </section>
        <section className="px-6">
          <div className="mb-6">
            <h2 className="font-serif text-3xl mb-2">Personalized Recommendations</h2>
            <p className="text-sm text-434843">Based on your ritual history and skin profile.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-12">
            {products.map((product) => (
              <div key={product.id} className="product-card group cursor-pointer">
                <div className="relative aspect-[4/5] bg-efeeea rounded-xl overflow-hidden mb-4">
                  <img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" src={product.image} alt={product.name}/>
                  <div className="quick-view-btn absolute bottom-4 left-4 right-4 opacity-0 translate-y-2 transition-all duration-300">
                    <button className="w-full bg-white/90 backdrop-blur-md text-061b0e py-3 rounded-xl font-sm hover:bg-white transition-colors">Quick View</button>
                  </div>
                  {product.newArrival && <span className="absolute top-4 left-4 bg-121912 text-fbf9f5 px-3 py-1 rounded-full text-xs font-sm uppercase tracking-wider">New Arrival</span>}
                </div>
                <h3 className="font-serif text-lg mb-1 group-hover:text-4d6453 transition-colors">{product.name}</h3>
                <p className="text-sm text-434843 uppercase tracking-widest mb-2">{product.category}</p>
                <p className="text-base text-061b0e font-bold">${product.price.toFixed(2)}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="px-6 mt-10">
          <div className="bg-1b3022 rounded-xl p-12 md:p-24 text-center">
            <h2 className="text-48px leading-1.2 -tracking-0.02em font-light text-fbf9f5 mb-6">Discover Your Skin's Potential</h2>
            <p className="text-base text-pink-500 mb-10 max-w-2xl mx-auto bg-pink-100 rounded-xl p-4">Take our personalized skin assessment to receive a curated ritual designed specifically for your unique complexion and lifestyle.</p>
            <button className="bg-efeeea text-061b0e px-10 py-5 rounded-xl font-base hover:bg-eae8e4 transition-all">Start the Quiz</button>
          </div>
        </section>
      </main>
      <nav className="md:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 py-3 bg-white shadow-[0_-4px_20px_rgba(27,48,34,0.04)]">
        <a className="flex flex-col items-center justify-center bg-1b3022 text-fbf9f5 rounded-xl p-2 transition-all" href="#">
          <span className="material-symbols-outlined">spa</span>
          <span className="font-sm text-sm">Shop</span>
        </a>
        <a className="flex flex-col items-center justify-center text-434843 p-2 hover:bg-eae8e4 transition-all" href="#">
          <span className="material-symbols-outlined">auto_awesome</span>
          <span className="font-sm text-sm">Ritual</span>
        </a>
        <a className="flex flex-col items-center justify-center text-434843 p-2 hover:bg-eae8e4 transition-all" href="#">
          <span className="material-symbols-outlined">favorite</span>
          <span className="font-sm text-sm">Saved</span>
        </a>
        <a className="flex flex-col items-center justify-center text-434843 p-2 hover:bg-eae8e4 transition-all" href="#">
          <span className="material-symbols-outlined">person</span>
          <span className="font-sm text-sm">Profile</span>
        </a>
      </nav>
    </div>
  );
};

export default HomePage;