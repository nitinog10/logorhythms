'use client';

import { useEffect, useState } from 'react';
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

const CatalogPage = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) return <p>Loading...</p>;
  if (error) return <p>{error}</p>;

  return (
    <div className="bg-background text-on-surface selection:bg-primary-fixed selection:text-on-primary-fixed">
      <header className="bg-surface dark:bg-surface fixed top-0 w-full z-50">
        <nav className="flex justify-between items-center w-full px-gutter max-w-container-max mx-auto h-20">
          <div className="flex items-center gap-12">
            <a className="font-h3 text-h3 text-primary dark:text-primary-fixed-dim tracking-tight" href="#">
              GlowSkin
            </a>
            <div className="hidden md:flex items-center gap-8">
              <a className="text-primary dark:text-primary-fixed-dim border-b border-primary dark:border-primary-fixed-dim pb-1 font-body-md" href="#">
                Shop
              </a>
              <a className="text-on-surface-variant dark:text-on-surface-variant hover:text-primary dark:hover:text-primary-fixed-dim transition-colors font-body-md" href="#">
                Rituals
              </a>
              <a className="text-on-surface-variant dark:text-on-surface-variant hover:text-primary dark:hover:text-primary-fixed-dim transition-colors font-body-md" href="#">
                About
              </a>
              <a className="text-on-surface-variant dark:text-on-surface-variant hover:text-primary dark:hover:text-primary-fixed-dim transition-colors font-body-md" href="#">
                Journal
              </a>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="hidden lg:flex items-center bg-surface-container-low px-4 py-2 rounded-full border border-outline-variant/30">
              <span className="material-symbols-outlined text-on-surface-variant text-sm">search</span>
              <input className="bg-transparent border-none focus:ring-0 text-body-md px-3 py-0 w-48 placeholder:text-on-surface-variant/60" placeholder="Search Rituals..." type="text" />
            </div>
            <div className="flex items-center gap-4">
              <button className="hover:opacity-80 transition-all duration-300 scale-95 active:scale-90 transition-transform">
                <span className="material-symbols-outlined text-primary">search</span>
              </button>
              <button className="hover:opacity-80 transition-all duration-300 scale-95 active:scale-90 transition-transform">
                <span className="material-symbols-outlined text-primary">shopping_bag</span>
              </button>
              <button className="hover:opacity-80 transition-all duration-300 scale-95 active:scale-90 transition-transform">
                <span className="material-symbols-outlined text-primary">person</span>
              </button>
            </div>
          </div>
        </nav>
      </header>
      <main className="pt-20 min-h-screen flex max-w-container-max mx-auto px-gutter gap-lg">
        <aside className="hidden md:flex flex-col w-80 shrink-0 py-xl sticky top-20 h-[calc(100vh-5rem)] overflow-y-auto hide-scrollbar">
          <div className="mb-lg">
            <h2 className="font-h3 text-h3 text-primary mb-1">Categories</h2>
            <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest">The Skincare Ritual</p>
          </div>
          <nav className="flex flex-col gap-sm mb-xl">
            <a className="text-on-surface-variant p-3 flex items-center gap-3 hover:bg-surface-container-highest transition-colors rounded-lg font-body-md" href="#">
              <span className="material-symbols-outlined">water_drop</span> Cleansers
            </a>
            <a className="bg-secondary-container dark:bg-primary-container text-primary dark:text-on-primary-container rounded-lg p-3 flex items-center gap-3 font-body-md" href="#">
              <span className="material-symbols-outlined">science</span> Serums
            </a>
            <a className="text-on-surface-variant p-3 flex items-center gap-3 hover:bg-surface-container-highest transition-colors rounded-lg font-body-md" href="#">
              <span className="material-symbols-outlined">spa</span> Moisturizers
            </a>
            <a className="text-on-surface-variant p-3 flex items-center gap-3 hover:bg-surface-container-highest transition-colors rounded-lg font-body-md" href="#">
              <span className="material-symbols-outlined">face_retouching_natural</span> Masks
            </a>
            <a className="text-on-surface-variant p-3 flex items-center gap-3 hover:bg-surface-container-highest transition-colors rounded-lg font-body-md" href="#">
              <span className="material-symbols-outlined">light_mode</span> Sun Protection
            </a>
          </nav>
          <div className="space-y-xl">
            <div className="space-y-md">
              <h4 className="font-label-sm text-label-sm uppercase tracking-widest text-primary">Price Range</h4>
              <div className="px-2">
                <input className="w-full h-1.5 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-primary-container" type="range" />
                <div className="flex justify-between mt-2 text-label-sm text-on-surface-variant">
                  <span>$0</span>
                  <span>$250+</span>
                </div>
              </div>
            </div>
            <div className="space-y-md">
              <h4 className="font-label-sm text-label-sm uppercase tracking-widest text-primary">Brand</h4>
              <div className="flex flex-col gap-sm">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input className="rounded-sm border-outline-variant text-primary focus:ring-primary h-4 w-4" type="checkbox" />
                  <span className="text-body-md text-on-surface-variant group-hover:text-primary transition-colors">GlowSkin Essence</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input className="rounded-sm border-outline-variant text-primary focus:ring-primary h-4 w-4" type="checkbox" />
                  <span className="text-body-md text-on-surface-variant group-hover:text-primary transition-colors">Pure Ritual</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input className="rounded-sm border-outline-variant text-primary focus:ring-primary h-4 w-4" type="checkbox" />
                  <span className="text-body-md text-on-surface-variant group-hover:text-primary transition-colors">Lumière Botanicals</span>
                </label>
              </div>
            </div>
            <div className="space-y-md">
              <h4 className="font-label-sm text-label-sm uppercase tracking-widest text-primary">Rating</h4>
              <div className="flex flex-col gap-sm">
                <button className="flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors">
                  <div className="flex text-primary">
                    <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                    <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                    <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                    <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                    <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 0" }}>star</span>
                  </div>
                  <span className="text-label-sm">& Up</span>
                </button>
              </div>
            </div>
            <button className="w-full py-4 border border-primary text-primary font-label-sm uppercase tracking-widest rounded-xl hover:bg-primary hover:text-on-primary transition-all duration-300">
              View All Products
            </button>
          </div>
        </aside>
        <section className="flex-1 py-xl">
          <div className="flex justify-between items-baseline mb-lg">
            <div>
              <h1 className="font-h2 text-h2 text-primary mb-2">Targeted Serums</h1>
              <p className="font-body-md text-on-surface-variant">24 Products found in this category</p>
            </div>
            <div className="flex items-center gap-2 font-label-sm text-on-surface-variant cursor-pointer hover:text-primary transition-colors">
              <span>Sort by: Featured</span>
              <span className="material-symbols-outlined text-sm">expand_more</span>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
            {products.map((product) => (
              <div key={product.id} className="group cursor-pointer">
                <div className="relative aspect-[4/5] overflow-hidden bg-surface-container-low rounded-lg mb-4">
                  <img className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" src={product.imageUrl} alt={product.name} />
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[85%] translate-y-12 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500">
                    <button className="w-full py-3 bg-white/90 backdrop-blur-md text-primary font-label-sm uppercase tracking-widest rounded-lg shadow-xl hover:bg-primary hover:text-on-primary transition-colors">
                      Quick View
                    </button>
                  </div>
                  <div className="absolute top-4 left-4">
                    <span className="bg-tertiary-fixed text-on-tertiary-fixed-variant px-3 py-1 rounded-full text-[10px] font-label-sm uppercase tracking-widest">New Arrival</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between items-start">
                    <h3 className="font-body-lg text-primary group-hover:underline underline-offset-4 decoration-1">{product.name}</h3>
                    <span className="font-body-md text-primary">${product.price.toFixed(2)}</span>
                  </div>
                  <p className="font-label-sm text-on-surface-variant uppercase tracking-widest">{product.brand}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex text-on-primary-container">
                      {Array.from({ length: product.rating }, (_, index) => (
                        <span key={index} className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                      ))}
                      {Array.from({ length: 5 - product.rating }, (_, index) => (
                        <span key={index} className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 0" }}>star</span>
                      ))}
                    </div>
                    <span className="text-[11px] text-on-surface-variant">({product.reviews})</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-xl flex justify-center items-center gap-4">
            <button className="p-2 text-on-surface-variant hover:text-primary transition-colors">
              <span className="material-symbols-outlined">chevron_left</span>
            </button>
            <div className="flex gap-2">
              <button className="w-10 h-10 rounded-full bg-primary text-on-primary font-label-sm">1</button>
              <button className="w-10 h-10 rounded-full hover:bg-surface-container-highest transition-colors text-on-surface-variant font-label-sm">2</button>
              <button className="w-10 h-10 rounded-full hover:bg-surface-container-highest transition-colors text-on-surface-variant font-label-sm">3</button>
              <span className="w-10 h-10 flex items-center justify-center text-on-surface-variant">...</span>
              <button className="w-10 h-10 rounded-full hover:bg-surface-container-highest transition-colors text-on-surface-variant font-label-sm">8</button>
            </div>
            <button className="p-2 text-on-surface-variant hover:text-primary transition-colors">
              <span className="material-symbols-outlined">chevron_right</span>
            </button>
          </div>
        </section>
      </main>
      <footer className="bg-surface-container-highest dark:bg-surface-container-high py-xl px-gutter mt-xl">
        <div className="flex flex-col md:flex-row justify-between items-center max-w-container-max mx-auto w-full gap-lg">
          <div className="text-center md:text-left">
            <h2 className="font-h3 text-h3 text-primary mb-2">GlowSkin</h2>
            <p className="font-label-sm text-label-sm uppercase tracking-widest text-on-surface-variant">© 2024 GlowSkin. Crafted for intentional beauty.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-8">
            <a className="font-label-sm text-label-sm uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors" href="#">Shipping</a>
            <a className="font-label-sm text-label-sm uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors" href="#">Sustainability</a>
            <a className="font-label-sm text-label-sm uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors" href="#">Privacy Policy</a>
            <a className="font-label-sm text-label-sm uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors" href="#">Rituals Guide</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default CatalogPage;