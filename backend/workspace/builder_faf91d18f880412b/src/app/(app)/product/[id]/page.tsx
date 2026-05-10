"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import axios from "axios";

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

const ProductDetailPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        const response = await axios.get(`/api/products/${id}`);
        setProduct(response.data);
        setLoading(false);
      } catch (err) {
        setError("Failed to load product");
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
    <div className="font-body-md text-body-md antialiased">
      <header className="bg-surface-container-lowest dark:bg-surface-dim shadow-sm docked full-width top-0 sticky z-50">
        <div className="max-w-[1280px] mx-auto px-gutter h-20 flex items-center justify-between">
          <div className="flex items-center gap-lg">
            <span className="font-h2 text-h2 font-bold text-on-surface dark:text-inverse-on-surface">LUXE</span>
            <nav className="hidden md:flex items-center gap-md">
              <a className="text-secondary dark:text-secondary-fixed-dim hover:text-primary dark:hover:text-primary-fixed-dim transition-colors font-body-md text-body-md" href="#">Electronics</a>
              <a className="text-secondary dark:text-secondary-fixed-dim hover:text-primary dark:hover:text-primary-fixed-dim transition-colors font-body-md text-body-md" href="#">Fashion</a>
              <a className="text-secondary dark:text-secondary-fixed-dim hover:text-primary dark:hover:text-primary-fixed-dim transition-colors font-body-md text-body-md" href="#">Home</a>
              <a className="text-secondary dark:text-secondary-fixed-dim hover:text-primary dark:hover:text-primary-fixed-dim transition-colors font-body-md text-body-md" href="#">Sports</a>
            </nav>
          </div>
          <div className="flex items-center gap-md">
            <div className="hidden md:block relative">
              <input className="bg-surface-container-low border-none rounded-lg px-md py-2 text-body-sm w-64 focus:ring-2 focus:ring-primary-container" placeholder="Search..." type="text"/>
              <span className="material-symbols-outlined absolute right-3 top-2 text-secondary" data-icon="search">search</span>
            </div>
            <button className="scale-95 active:scale-90 transition-transform text-primary dark:text-primary-fixed-dim">
              <span className="material-symbols-outlined" data-icon="shopping_cart">shopping_cart</span>
            </button>
            <button className="scale-95 active:scale-90 transition-transform text-primary dark:text-primary-fixed-dim">
              <span className="material-symbols-outlined" data-icon="person">person</span>
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-[1280px] mx-auto px-gutter py-xl">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-xl">
          <div className="lg:col-span-7 flex flex-col gap-md">
            <div className="aspect-[4/5] bg-surface-container-low rounded-lg overflow-hidden shadow-sm">
              <img className="w-full h-full object-cover" src={product.imageUrl} alt={product.name} />
            </div>
            <div className="grid grid-cols-4 gap-sm">
              {product.imageUrl && (
                <div className="aspect-square bg-surface-container-low rounded-lg overflow-hidden cursor-pointer border-2 border-primary-container">
                  <img className="w-full h-full object-cover" src={product.imageUrl} alt={product.name} />
                </div>
              )}
              <div className="aspect-square bg-surface-container-low rounded-lg overflow-hidden cursor-pointer hover:opacity-80 transition-opacity">
                <img className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCUMPWt3ZImtYqzWlxeKgG88NrI5-dSq7GD29nzXW8qpoXXR34ekmvpFoWHfHzGlbrbIr9v0A_C_xZBmVNBwJ77HyeD-mEyZUvYgoRGYYDBbuOxMsvtwDhOKgqZ5mK4xW7pwQKztcAg4wQVQcDHsyfx10PsyH18QHZLhfDVrutzuxvWrmLwpC8VvsvzEoAnZRIIpDSH95TzTpvID3zv3ZCAR6SDPx4WzBxxa53dLE_cB9115bWDGxnscptjJxVxrqlkW67xNicUEkNQ" alt="Detailed macro shot of the amber-colored leather headband" />
              </div>
              <div className="aspect-square bg-surface-container-low rounded-lg overflow-hidden cursor-pointer hover:opacity-80 transition-opacity">
                <img className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCUA7XuyVPbcrQk1QbV0EDkZ5uhxrfb6IQjqS0fiizvtV3hYLDzLdYQcWG3u9x0bR7qRNYL1wQniA39Rt63XjU8UsWxbgfm2I33RVrXB63cnAD4mmews1XlEkhuxcaiL_9BBJBXgIbn0I3huJ8L_I666JiKLDlpJALawRwGstSetYcQNsZeutsb9zh2GFo0ZLtCm_xE7O5UfmghYXFfEtIk1oD3aibQVCsBhyU98nJG6H5j16CfwMLlGf8h8KPt3Igg5eMoYvZKZanQ" alt="Side view of the Acoustic Pro Headphones" />
              </div>
              <div className="aspect-square bg-surface-container-low rounded-lg overflow-hidden cursor-pointer hover:opacity-80 transition-opacity">
                <img className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBKdf6SD8_ke2M9V7UTdTSwrfYuPCBoQHIVO2_iFZr6hbWk-T2r--hGMbRMeJa1utVTCEtRQ-cY0-yZiLYva4yQ1CRUvVOZOGA-7_5wkKfeHFCLkFVgVymC7XiM7ALoSNabNYvLEsyO4mOK79cEUrjpxioncMiRJhUke4jf9CdayIBkDu8OipY42qYnYYNR3t472oEtmq1rqpUduZ_tBi86-_DaMQZBLCsrJbsslq3UOcTjYc6B87mReyfQsQz-F8xcaBkmXNhl89un" alt="Lifestyle photograph of the Acoustic Pro Headphones" />
              </div>
              <div className="aspect-square bg-surface-container-low rounded-lg overflow-hidden cursor-pointer hover:opacity-80 transition-opacity">
                <img className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDB1Ofj5uWeFA9_dHP0e1iK_lsKUjuK1iHWr445ork44X7l0fBKzivJkJXsxb5iXO3EsUFEulffnpRVZEpT39Y8sEerYKS_Hs64iSfRqkYLY_R2vgO3owzIuetgKWqqi4Sg9NIjCpxNwVd_vr3ljduae2Sqd75TFqHT-s6LgWgvtNvmWVUyOgh_-JqLbUfzXvmnE3bT7TQduw3bIcxX-9sm4c6ft9XI7xSJQTdoeo0Cst0OBPMP8NOhafNLQPS4sllqAa6PeQepqZ9c" alt="Rear view of the Acoustic Pro Headphones" />
              </div>
            </div>
          </div>
          <div className="lg:col-span-5 flex flex-col gap-md">
            <nav className="flex text-label-sm text-secondary gap-xs">
              <a className="hover:text-primary" href="#">Home</a>
              <span>/</span>
              <a className="hover:text-primary" href="#">Electronics</a>
              <span>/</span>
              <span className="text-on-surface">Headphones</span>
            </nav>
            <h1 className="font-h1 text-h1 text-on-surface">{product.name}</h1>
            <div className="flex items-center gap-xs">
              <div className="flex text-primary-container">
                {[...Array(Math.floor(product.rating))].map((_, index) => (
                  <span key={index} className="material-symbols-outlined" data-icon="star" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                ))}
                {product.rating % 1!== 0 && (
                  <span className="material-symbols-outlined" data-icon="star_half" style={{ fontVariationSettings: "'FILL' 1" }}>star_half</span>
                )}
              </div>
              <span className="font-body-sm text-body-sm text-secondary">({product.reviews} reviews)</span>
            </div>
            <div className="font-h2 text-h2 text-on-surface">${product.price.toFixed(2)}</div>
            <p className="font-body-md text-body-md text-secondary leading-relaxed">
              {product.description}
            </p>
            <div className="flex flex-col gap-md pt-md">
              <div className="flex flex-col gap-base">
                <label className="font-label-md text-label-md text-on-surface">Size</label>
                <select className="bg-surface-container-lowest border-[1.5px] border-surface-variant rounded-lg p-sm focus:border-primary-container focus:ring-1 focus:ring-primary-container font-body-md outline-none">
                  <option>Standard</option>
                  <option>XL</option>
                </select>
              </div>
              <div className="flex flex-col gap-base">
                <label className="font-label-md text-label-md text-on-surface">Color</label>
                <div className="flex gap-sm">
                  <button className="w-10 h-10 rounded-full bg-[#FFBF00] border-2 border-white ring-2 ring-primary-container shadow-sm"></button>
                  <button className="w-10 h-10 rounded-full bg-[#121212] border-2 border-white hover:ring-2 hover:ring-surface-variant transition-all"></button>
                  <button className="w-10 h-10 rounded-full bg-[#708090] border-2 border-white hover:ring-2 hover:ring-surface-variant transition-all"></button>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-sm pt-lg">
              <div className="flex gap-sm">
                <div className="flex items-center border-[1.5px] border-surface-variant rounded-lg h-[48px]">
                  <button className="px-md text-secondary hover:text-on-surface"><span className="material-symbols-outlined" data-icon="remove">remove</span></button>
                  <span className="w-12 text-center font-bold">1</span>
                  <button className="px-md text-secondary hover:text-on-surface"><span className="material-symbols-outlined" data-icon="add">add</span></button>
                </div>
                <button className="flex-1 bg-primary-container text-[#121212] font-bold py-sm px-md rounded-lg hover:brightness-95 transition-all shadow-sm">
                  Add to Cart
                </button>
              </div>
              <button className="w-full border-[1.5px] border-[#121212] text-[#121212] font-bold py-sm px-md rounded-lg hover:bg-surface-container-low transition-all">
                Buy Now
              </button>
            </div>
            <div className="flex flex-col gap-sm pt-md border-t border-surface-variant mt-md">
              <div className="flex items-center gap-sm text-body-sm text-secondary">
                <span className="material-symbols-outlined text-primary" data-icon="local_shipping">local_shipping</span>
                <span>Free express shipping on orders over $500</span>
              </div>
              <div className="flex items-center gap-sm text-body-sm text-secondary">
                <span className="material-symbols-outlined text-primary" data-icon="verified_user">verified_user</span>
                <span>2-year manufacturer warranty</span>
              </div>
            </div>
          </div>
        </div>
        <section className="mt-xl">
          <div className="flex border-b border-surface-variant gap-lg">
            <button className="pb-base border-b-2 border-primary-container text-on-surface font-bold text-label-md">Description</button>
            <button className="pb-base text-secondary hover:text-on-surface font-bold text-label-md transition-colors">Specifications</button>
            <button className="pb-base text-secondary hover:text-on-surface font-bold text-label-md transition-colors">Reviews</button>
          </div>
          <div className="py-lg max-w-3xl">
            <p className="text-body-md text-secondary mb-md">
              The Acoustic Pro Headphones are the result of three years of relentless pursuit of sonic perfection. Every component, from the high-resolution neodymium drivers to the precision-tuned acoustic chambers, is designed to reveal layers of music you've never heard before.
            </p>
            <p className="text-body-md text-secondary">
              Engineered for comfort during extended listening sessions, the lightweight magnesium frame and memory-foam cushions ensure that the only thing you'll feel is the rhythm. Whether you're in a busy city or a quiet studio, the passive noise isolation provides a serene backdrop for your favorite albums.
            </p>
          </div>
        </section>
        <section className="mt-xl">
          <h2 className="font-h2 text-h2 text-on-surface mb-lg">Related Products</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-md">
            <div className="bg-surface-container-lowest rounded-lg shadow-sm hover:shadow-md transition-all overflow-hidden group">
              <div className="h-64 bg-surface-container-low overflow-hidden">
                <img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBsF7J6Uq0YEAnLr4VGGw7XiaLetQeSss27nXxgqT6vOBRIkoVQt8PRiKF_4tzRgbZFW7dpvxSU-2bgawonpvMATtlUGcw4CWD2W-GhlkxyiPSl1lhsP9dVenz6TYeUU-C_3bpUn8E6mc5Hpyb1DinmKbDFJE2bfSGT17V2_isakEZV92ZQ8aU26fJc9-SRvUgaBVF3M3EmpBLL3bOOxNQRYPyEzfNIS1NvVpMJWmDMm5uyaZ2ygZJkQ7cVDFbxzgAQUoSuMkvYlS-u" alt="Luxe Analog M1" />
              </div>
              <div className="p-md flex flex-col gap-xs">
                <span className="text-label-sm text-secondary">Electronics</span>
                <h3 className="font-h3 text-h3 text-on-surface">Luxe Analog M1</h3>
                <div className="font-h3 text-h3 text-primary">$1,299.00</div>
              </div>
            </div>
            <div className="bg-surface-container-lowest rounded-lg shadow-sm hover:shadow-md transition-all overflow-hidden group">
              <div className="h-64 bg-surface-container-low overflow-hidden">
                <img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCPNZvdpuQ25LQO3la-3wvLKHp1vAA_lVx-MPdiuTAcO2d0K8Jz1WNcJBXIyf0AodtshfjWdCaM0x5GeBB-IrdtGknEsJ-C8gsYJF4RSYL187ACQHeo1N3xs2xZei_JiA-8fqpUS6jaRjUIL0KWwYdolzFhfS6a5LqUU1sWsJ0Mox0ynEOrNkm_t7RKSXYSKr0JTVoxJqxXBzJ7HHzMG56X47PeE3WZDTUnzqt8MtYOSTO1zGbZ8f9QmPf3X5m_H9XQBEh3Jl0H3Gql" alt="Orbit Glow Lamp" />
              </div>
              <div className="p-md flex flex-col gap-xs">
                <span className="text-label-sm text-secondary">Home Decor</span>
                <h3 className="font-h3 text-h3 text-on-surface">Orbit Glow Lamp</h3>
                <div className="font-h3 text-h3 text-primary">$189.00</div>
              </div>
            </div>
            <div className="bg-surface-container-lowest rounded-lg shadow-sm hover:shadow-md transition-all overflow-hidden group">
              <div className="h-64 bg-surface-container-low overflow-hidden">
                <img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAF_6Ydg6fT-X7FeP3v0i1payeGtZl0ysdxoWCozwp8FDlNiZlBPm_8vFEvlt8CBQtEQlpg_0fNoVQNt9TgAe654d0U6BdyMgvJlQMy73z8yZ6GNSy0RjdeQqUB7K-wS1YfPm5UcpeWVhn3ru9KoEWp3N7RJSQVpTD-iAjbJ9_x6WgJTobFkSwdAE10xV2_zdbz0xxrfVTwmejYZpS3S4ER7lOIrNAM9UcRQ2xK2mxGCjJJl2uuTlonOyuwNkr3ftASvKoXAJMKupAe" alt="Sonic Sphere" />
              </div>
              <div className="p-md flex flex-col gap-xs">
                <span className="text-label-sm text-secondary">Electronics</span>
                <h3 className="font-h3 text-h3 text-on-surface">Sonic Sphere</h3>
                <div className="font-h3 text-h3 text-primary">$450.00</div>
              </div>
            </div>
            <div className="bg-surface-container-lowest rounded-lg shadow-sm hover:shadow-md transition-all overflow-hidden group">
              <div className="h-64 bg-surface-container-low overflow-hidden">
                <img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" src="https://lh3.googleusercontent.com/aida-public/AB6AXuADMvf2tWVZ0-43aBDQWilUG2Zk6C7KbWwq2XQ0-0PMs0e2Kb67vD_Hgk3Px2huYe9Gsevte1D1afwt1EzAOlIOB811-1yUdU62p1mrnieZkktpkiTjq7jLfG-ehnV8t05LbeGNly2Gi-WHraDvTUDcqzNquWL-WgB41T-TnuG9QUnLWOqWHVFFFS5EzB9GoCtDrFn-ZFIn6UQ77ASdsMXdsHHgKXWhem41hROLoYY4kejj_EF5A3cWP1AO5AI2fDSguFL6lInM4jfF5" alt="Obsidian Sleeve" />
              </div>
              <div className="p-md flex flex-col gap-xs">
                <span className="text-label-sm text-secondary">Lifestyle</span>
                <h3 className="font-h3 text-h3 text-on-surface">Obsidian Sleeve</h3>
                <div className="font-h3 text-h3 text-primary">$120.00</div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="bg-surface-container-low dark:bg-inverse-surface border-t border-surface-variant dark:border-outline-variant full-width bottom-0">
        <div className="max-w-[1280px] mx-auto px-gutter py-xl flex flex-col md:flex-row justify-between items-center gap-md">
          <div className="flex flex-col gap-base items-center md:items-start">
            <span className="font-h3 text-h3 font-bold text-on-surface dark:text-inverse-on-surface">LUXE</span>
            <span className="font-body-sm text-body-sm dark:text-surface-variant text-secondary">© 2024 LUXE Boutique. All rights reserved.</span>
          </div>
          <div className="flex flex-wrap justify-center gap-md">
            <a className="text-secondary dark:text-secondary-fixed-dim hover:text-primary dark:hover:text-primary-fixed-dim underline transition-all font-body-sm text-body-sm" href="#">About Us</a>
            <a className="text-secondary dark:text-secondary-fixed-dim hover:text-primary dark:hover:text-primary-fixed-dim underline transition-all font-body-sm text-body-sm" href="#">Shipping</a>
            <a className="text-secondary dark:text-secondary-fixed-dim hover:text-primary dark:hover:text-primary-fixed-dim underline transition-all font-body-sm text-body-sm" href="#">Returns</a>
            <a className="text-secondary dark:text-secondary-fixed-dim hover:text-primary dark:hover:text-primary-fixed-dim underline transition-all font-body-sm text-body-sm" href="#">Terms of Service</a>
            <a className="text-secondary dark:text-secondary-fixed-dim hover:text-primary dark:hover:text-primary-fixed-dim underline transition-all font-body-sm text-body-sm" href="#">Privacy Policy</a>
            <a className="text-secondary dark:text-secondary-fixed-dim hover:text-primary dark:hover:text-primary-fixed-dim underline transition-all font-body-sm text-body-sm" href="#">Contact</a>
          </div>
          <div className="flex gap-md">
            <span className="material-symbols-outlined text-secondary hover:text-primary cursor-pointer transition-colors" data-icon="public">public</span>
            <span className="material-symbols-outlined text-secondary hover:text-primary cursor-pointer transition-colors" data-icon="language">language</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default ProductDetailPage;