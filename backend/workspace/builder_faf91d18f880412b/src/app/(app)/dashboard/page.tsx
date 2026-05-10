'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';

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

  if (loading) return <p>Loading...</p>;
  if (error) return <p>{error}</p>;

  return (
    <div className="bg-background text-on-surface font-body-md">
      <header className="bg-surface-container-lowest shadow-sm sticky top-0 z-50">
        <div className="max-w-[1280px] mx-auto px-gutter h-20 flex items-center justify-between">
          <div className="flex items-center gap-xl">
            <a className="font-h2 text-h2 font-bold text-on-surface" href="#">LUXE</a>
            <nav className="hidden md:flex items-center gap-md">
              <a className="text-primary font-bold border-b-2 border-primary pb-1 font-body-md text-body-md" href="#">Electronics</a>
              <a className="text-secondary hover:text-primary transition-colors font-body-md text-body-md" href="#">Fashion</a>
              <a className="text-secondary hover:text-primary transition-colors font-body-md text-body-md" href="#">Home</a>
              <a className="text-secondary hover:text-primary transition-colors font-body-md text-body-md" href="#">Sports</a>
            </nav>
          </div>
          <div className="flex items-center gap-md flex-1 justify-end">
            <div className="relative hidden lg:block w-full max-w-md mx-md">
              <input className="w-full bg-surface-container-low border-1.5 border-outline-variant rounded-lg py-2 px-md focus:ring-2 focus:ring-primary-container outline-none transition-all text-body-sm" placeholder="Search curated collections..." type="text"/>
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-secondary">search</span>
            </div>
            <div className="flex items-center gap-sm">
              <button className="relative p-2 hover:bg-surface-container transition-colors rounded-full">
                <span className="material-symbols-outlined" data-icon="shopping_cart">shopping_cart</span>
                <span className="absolute top-0 right-0 bg-primary-container text-on-primary-container text-[10px] font-bold h-4 w-4 flex items-center justify-center rounded-full">3</span>
              </button>
              <button className="p-2 hover:bg-surface-container transition-colors rounded-full">
                <span className="material-symbols-outlined" data-icon="person">person</span>
              </button>
            </div>
          </div>
        </div>
      </header>
      <main>
        <section className="max-w-[1280px] mx-auto px-gutter pt-md pb-xl">
          <div className="relative w-full h-[540px] rounded-xl overflow-hidden shadow-sm group">
            <img className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" data-alt="A high-end minimalist lifestyle photograph featuring a sleek, luxury tech product on a clean marble surface. The lighting is soft and directional, creating elegant shadows on a crisp white backdrop. The overall mood is sophisticated and editorial, using a palette of whites, ambers, and charcoal blacks to emphasize premium quality. High-key lighting highlights the polished metallic details of the featured item." src="https://lh3.googleusercontent.com/aida-public/AB6AXuDG50tEO-ouCfue1ef13-Dj9L4XNGoC63i_N3IzkXMBIFj3_8PbmqT3OpbRcqWD_TJ7EM_0J-NZF_ek8zrGrXT6m4uQkjWnpZdE_69RbEuMIqkrmkbcxELHArQDuQQNU-6Qi12IEmH1FqoM5Cr-WYGO6yOutT6rav5EYdC4_MCuEziGQ-PVukcT1kQkRmG1OFOfDxQS51I-gHxkVzLaVElMElgM8Y4fcncB3xyGBXEc5Rcd43K4xWFpJ-VmX6vvN0zf6VC8Tdb5ZdFT/iphone"/>
            <div className="absolute inset-0 bg-gradient-to-r from-black/40 to-transparent flex items-center">
              <div className="px-xl max-w-2xl text-white">
                <span className="inline-block px-4 py-1 bg-primary-container text-on-primary-container font-label-md text-label-md rounded-full mb-md">NEW SEASON 2024</span>
                <h1 className="font-display text-display mb-md">Redefining Minimalist Elegance</h1>
                <p className="font-body-lg text-body-lg mb-lg opacity-90">Experience our curated collection of artisanal essentials designed for the modern connoisseur.</p>
                <button className="bg-primary-container text-on-primary-container px-lg py-4 rounded-lg font-bold text-body-md hover:scale-105 active:scale-95 transition-all shadow-md">
                  Shop The Collection
                </button>
              </div>
            </div>
          </div>
        </section>
        <section className="max-w-[1280px] mx-auto px-gutter py-xl">
          <div className="flex items-end justify-between mb-lg">
            <div>
              <h2 className="font-h1 text-h1 text-on-surface">Featured Excellence</h2>
              <p className="text-secondary font-body-md mt-2">The highest standards of design and functionality.</p>
            </div>
            <a className="text-primary font-bold hover:underline flex items-center gap-1" href="#">
              View All <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </a>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
            {products.slice(0, 6).map((product) => (
              <div key={product.id} className="bg-surface-container-lowest rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow group">
                <div className="relative aspect-square rounded-lg overflow-hidden mb-md bg-surface-container">
                  <img className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" data-alt={product.description} src={product.imageUrl}/>
                  <button className="absolute top-3 right-3 bg-white/80 backdrop-blur-sm p-2 rounded-full hover:bg-white transition-colors">
                    <span className="material-symbols-outlined text-on-surface" data-icon="favorite">favorite</span>
                  </button>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-1 text-primary-container">
                    {[...Array(Math.floor(product.rating)).keys()].map((_, index) => (
                      <span key={index} className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                    ))}
                    {product.rating % 1!== 0 && (
                      <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>star_half</span>
                    )}
                    <span className="text-secondary font-body-sm ml-1">({product.reviews})</span>
                  </div>
                  <h3 className="font-body-md text-body-md font-semibold text-on-surface">{product.name}</h3>
                  <p className="font-h3 text-h3 text-on-surface">${product.price.toFixed(2)}</p>
                  <button className="w-full mt-2 bg-white border-1.5 border-on-surface text-on-surface font-bold py-3 rounded-lg hover:bg-primary-container hover:border-primary-container transition-all flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined text-lg">add_shopping_cart</span>
                    Add to Cart
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="bg-surface-container-low py-xl">
          <div className="max-w-[1280px] mx-auto px-gutter">
            <div className="flex items-center justify-between mb-lg">
              <h2 className="font-h1 text-h1 text-on-surface">New Arrivals</h2>
              <div className="flex gap-sm">
                <button className="w-10 h-10 flex items-center justify-center rounded-full border border-outline bg-white hover:bg-primary-container transition-colors">
                  <span className="material-symbols-outlined">chevron_left</span>
                </button>
                <button className="w-10 h-10 flex items-center justify-center rounded-full border border-outline bg-white hover:bg-primary-container transition-colors">
                  <span className="material-symbols-outlined">chevron_right</span>
                </button>
              </div>
            </div>
            <div className="flex overflow-x-auto gap-md no-scrollbar pb-md">
              {products.slice(6, 12).map((product) => (
                <div key={product.id} className="flex-none w-72 bg-white rounded-lg p-3 shadow-sm">
                  <div className="aspect-[3/4] rounded-md overflow-hidden bg-surface-container mb-3">
                    <img className="w-full h-full object-cover" data-alt={product.description} src={product.imageUrl}/>
                  </div>
                  <h3 className="font-body-md text-body-md font-semibold text-on-surface">{product.name}</h3>
                  <p className="font-h3 text-h3 text-on-surface">${product.price.toFixed(2)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <style jsx>{`
       .no-scrollbar::-webkit-scrollbar { display: none; }
       .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
       .material-symbols-outlined {
          font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
        }
      `}</style>
    </div>
  );
};

export default HomePage;