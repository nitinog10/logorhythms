'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
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

const ProductDetailPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        const response = await axios.get(`/api/products/${id}`);
        setProduct(response.data);
      } catch (err) {
        setError('Failed to load product');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchProduct();
    }
  }, [id]);

  if (loading) return <p>Loading...</p>;
  if (error) return <p>{error}</p>;
  if (!product) return <p>Product not found</p>;

  return (
    <div className="bg-background text-on-background font-body-md">
      <header className="bg-surface/90 backdrop-blur-md shadow-sm dark:shadow-none docked full-width top-0 sticky z-50">
        <nav className="flex justify-between items-center w-full max-w-container-max mx-auto px-gutter py-md">
          <div className="flex items-center gap-xl">
            <a className="font-h2 text-h2 tracking-tight text-primary dark:text-primary-fixed" href="#">GlowSkin</a>
            <div className="hidden md:flex gap-lg">
              <a className="font-label-sm text-label-sm text-primary dark:text-primary-fixed border-b border-primary pb-1" href="#">Shop All</a>
              <a className="font-label-sm text-label-sm text-secondary dark:text-secondary-fixed-dim hover:text-primary transition-colors" href="#">Rituals</a>
              <a className="font-label-sm text-label-sm text-secondary dark:text-secondary-fixed-dim hover:text-primary transition-colors" href="#">Sustainability</a>
              <a className="font-label-sm text-label-sm text-secondary dark:text-secondary-fixed-dim hover:text-primary transition-colors" href="#">About</a>
            </div>
          </div>
          <div className="flex items-center gap-md">
            <button className="p-xs hover:bg-surface-container-low transition-all duration-300 rounded-full scale-95 active:scale-100 transition-transform">
              <span className="material-symbols-outlined text-primary" data-icon="search">search</span>
            </button>
            <button className="p-xs hover:bg-surface-container-low transition-all duration-300 rounded-full scale-95 active:scale-100 transition-transform">
              <span className="material-symbols-outlined text-primary" data-icon="shopping_bag">shopping_bag</span>
            </button>
          </div>
        </nav>
      </header>
      <main className="max-w-container-max mx-auto px-gutter py-xl">
        <section className="grid grid-cols-1 md:grid-cols-12 gap-xl items-start">
          <div className="md:col-span-7 bg-surface-container rounded-xl overflow-hidden aspect-[4/5] relative">
            <img alt={product.name} className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDwGke-5tcPaPZPOU1V2TwxvazlecvevqSkXnPLo4OjdJrwcr3v-Gxx6aO4WF7QOlQe94gmPpbCF867Urss7Plf5Ewd-RuRzBvKmGw-duAUNilAT3QjaE3sMbieHQ65fELzjZN6PutYvbllqbx091NH6VphVmwEYsxozhl5PTNXKf_J_0ONQC3-m5mZetITYmtOmKsPcqI9fp22J3eJGiJhAM3a0zzfjhKy8mFHK8AaVSeWTqYZ8uLNPUTm5ZD5xiPyAbonAxMR5BCo" />
            <div className="absolute top-md left-md">
              <span className="bg-secondary-container text-primary font-label-sm text-label-sm px-md py-xs rounded-full uppercase tracking-widest">New Ritual</span>
            </div>
          </div>
          <div className="md:col-span-5 flex flex-col space-y-lg">
            <div className="space-y-sm">
              <p className="font-label-sm text-label-sm text-secondary uppercase tracking-widest">GlowSkin Essence</p>
              <h1 className="font-h1 text-h1 text-primary">{product.name}</h1>
              <p className="font-h3 text-h3 text-surface-tint">${product.price.toFixed(2)}</p>
            </div>
            <div className="flex items-center gap-sm">
              <div className="flex text-primary">
                {[...Array(5)].map((_, index) => (
                  <span key={index} className="material-symbols-outlined fill-icon text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                ))}
              </div>
              <span className="font-label-sm text-label-sm text-secondary">(124 Reviews)</span>
            </div>
            <p className="font-body-lg text-body-lg text-on-surface-variant leading-relaxed">
              {product.description}
            </p>
            <div className="flex flex-col gap-md pt-md">
              <button className="w-full py-md px-lg bg-primary text-on-primary rounded-xl font-label-sm text-label-sm uppercase tracking-widest hover:opacity-90 transition-all scale-95 active:scale-100">
                Buy Now
              </button>
              <div className="flex gap-md">
                <button className="flex-1 py-md px-lg border border-outline-variant text-primary rounded-xl font-label-sm text-label-sm uppercase tracking-widest hover:bg-surface-container-low transition-all scale-95 active:scale-100">
                  Add to Cart
                </button>
                <button className="p-md border border-outline-variant text-primary rounded-xl hover:bg-surface-container-low transition-all scale-95 active:scale-100">
                  <span className="material-symbols-outlined" data-icon="favorite">favorite</span>
                </button>
              </div>
            </div>
            <div className="pt-xl space-y-md border-t border-outline-variant">
              <details className="group cursor-pointer" open="">
                <summary className="flex justify-between items-center py-md list-none group-hover:text-primary transition-colors">
                  <span className="font-label-sm text-label-sm uppercase tracking-widest">Key Ingredients</span>
                  <span className="material-symbols-outlined group-open:rotate-180 transition-transform">expand_more</span>
                </summary>
                <div className="pb-md space-y-md">
                  <div>
                    <h4 className="font-body-md font-bold text-primary">Vitamin C (L-Ascorbic Acid)</h4>
                    <p className="text-secondary text-body-md">Potent antioxidant that brightens tone and boosts collagen production.</p>
                  </div>
                  <div>
                    <h4 className="font-body-md font-bold text-primary">Ferulic Acid</h4>
                    <p className="text-secondary text-body-md">Enhances the stability and efficacy of Vitamin C for superior protection.</p>
                  </div>
                  <div>
                    <h4 className="font-body-md font-bold text-primary">Hyaluronic Acid</h4>
                    <p className="text-secondary text-body-md">Delivers deep hydration, plumping the skin's surface instantly.</p>
                  </div>
                </div>
              </details>
              <details className="group cursor-pointer border-t border-outline-variant">
                <summary className="flex justify-between items-center py-md list-none group-hover:text-primary transition-colors">
                  <span className="font-label-sm text-label-sm uppercase tracking-widest">How to Use</span>
                  <span className="material-symbols-outlined group-open:rotate-180 transition-transform">expand_more</span>
                </summary>
                <div className="pb-md">
                  <p className="text-secondary text-body-md leading-relaxed">
                    In the quiet of the morning, apply 3-5 drops to clean, dry skin. Gently press the serum into your face and neck, allowing it to absorb fully before continuing with your ritual. Always follow with a broad-spectrum SPF to protect your radiance.
                  </p>
                </div>
              </details>
            </div>
          </div>
        </section>
        <section className="mt-xl py-xl border-t border-outline-variant">
          <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-lg mb-xl">
            <div className="space-y-sm">
              <h2 className="font-h2 text-h2 text-primary">The Ritual Experience</h2>
              <p className="text-secondary">Measured reflections from our community.</p>
            </div>
            <div className="flex items-center gap-md bg-surface-container-low p-md rounded-xl">
              <div className="text-center px-md border-r border-outline-variant">
                <p className="font-h3 text-h3 text-primary">4.9</p>
                <p className="font-label-sm text-label-sm text-secondary">Average</p>
              </div>
              <div className="px-md">
                <button className="font-label-sm text-label-sm uppercase tracking-widest text-primary underline underline-offset-4">Write a review</button>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-lg">
            <div className="bg-surface-container-lowest p-lg rounded-xl flex flex-col justify-between space-y-md border border-surface-container">
              <div className="space-y-sm">
                <div className="flex text-primary">
                  {[...Array(5)].map((_, index) => (
                    <span key={index} className="material-symbols-outlined fill-icon text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                  ))}
                </div>
                <p className="font-h3 text-h3 leading-tight text-primary">"A transformative morning ritual."</p>
                <p className="text-secondary text-body-md">My skin has never looked more vibrant. The texture is so light, it feels like silk absorbing into my skin.</p>
              </div>
              <div className="flex items-center gap-sm">
                <div className="w-8 h-8 rounded-full bg-primary-fixed-dim flex items-center justify-center text-primary font-bold text-xs">EJ</div>
                <p className="font-label-sm text-label-sm text-primary uppercase">Eleanor J.</p>
              </div>
            </div>
            <div className="bg-primary-container p-lg rounded-xl flex flex-col justify-between space-y-md md:col-span-1">
              <div className="space-y-sm">
                <div className="flex text-on-primary-container">
                  {[...Array(5)].map((_, index) => (
                    <span key={index} className="material-symbols-outlined fill-icon text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                  ))}
                </div>
                <p className="font-h3 text-h3 leading-tight text-on-primary">"The glow is real."</p>
                <p className="text-on-primary-container text-body-md">Finally found a Vitamin C that doesn't irritate my sensitive skin. The scent is subtle and grounding.</p>
              </div>
              <div className="flex items-center gap-sm">
                <div className="w-8 h-8 rounded-full bg-surface-tint flex items-center justify-center text-on-primary font-bold text-xs">MA</div>
                <p className="font-label-sm text-label-sm text-on-primary uppercase">Marcus A.</p>
              </div>
            </div>
            <div className="bg-surface-container-lowest p-lg rounded-xl flex flex-col justify-between space-y-md border border-surface-container">
              <div className="space-y-sm">
                <div className="flex text-primary">
                  {[...Array(5)].map((_, index) => (
                    <span key={index} className="material-symbols-outlined fill-icon text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                  ))}
                </div>
                <p className="font-h3 text-h3 leading-tight text-primary">"Essential."</p>
                <p className="text-secondary text-body-md">My dark spots from sun damage have visibly faded after only three weeks. It's now a non-negotiable step.</p>
              </div>
              <div className="flex items-center gap-sm">
                <div className="w-8 h-8 rounded-full bg-secondary-fixed-dim flex items-center justify-center text-primary font-bold text-xs">SL</div>
                <p className="font-label-sm text-label-sm text-primary uppercase">Sarah L.</p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="bg-surface-container dark:bg-surface-container-high full-width">
        <div className="flex flex-col items-center justify-center w-full max-w-container-max mx-auto px-gutter py-xl space-y-lg">
          <h3 className="font-h3 text-h3 text-primary dark:text-primary-fixed">GlowSkin</h3>
          <div className="flex flex-wrap justify-center gap-md md:gap-xl">
            <a className="font-label-sm text-label-sm uppercase text-secondary dark:text-secondary-fixed-dim hover:text-primary dark:hover:text-primary-fixed transition-colors underline-offset-4 hover:underline" href="#">Sustainability</a>
            <a className="font-label-sm text-label-sm uppercase text-secondary dark:text-secondary-fixed-dim hover:text-primary dark:hover:text-primary-fixed transition-colors underline-offset-4 hover:underline" href="#">The Ritual</a>
            <a className="font-label-sm text-label-sm uppercase text-secondary dark:text-secondary-fixed-dim hover:text-primary dark:hover:text-primary-fixed transition-colors underline-offset-4 hover:underline" href="#">Shipping & Returns</a>
            <a className="font-label-sm text-label-sm uppercase text-secondary dark:text-secondary-fixed-dim hover:text-primary dark:hover:text-primary-fixed transition-colors underline-offset-4 hover:underline" href="#">Privacy Policy</a>
            <a className="font-label-sm text-label-sm uppercase text-secondary dark:text-secondary-fixed-dim hover:text-primary dark:hover:text-primary-fixed transition-colors underline-offset-4 hover:underline" href="#">Contact</a>
          </div>
          <div className="pt-md text-center opacity-80">
            <p className="font-body-md text-body-md text-secondary dark:text-secondary-fixed-dim">© 2024 GlowSkin. An intentional approach to skincare.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default ProductDetailPage;