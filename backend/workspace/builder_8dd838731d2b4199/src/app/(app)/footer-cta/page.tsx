'use client';

import { useEffect, useState } from'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

type User = {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
};

type Plan = {
  id: string;
  name: string;
  price: number;
  features: string[];
};

type Testimonial = {
  id: string;
  author: string;
  company: string;
  content: string;
};

const FooterCTA = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const usersResponse = await axios.get('/api/users');
        const plansResponse = await axios.get('/api/plans');
        const testimonialsResponse = await axios.get('/api/testimonials');
        setUsers(usersResponse.data);
        setPlans(plansResponse.data);
        setTestimonials(testimonialsResponse.data);
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

  return (
    <div className="bg-background font-body-md text-on-surface antialiased">
      <main className="mesh-gradient min-h-screen flex flex-col items-center justify-center py-stack-lg px-margin-page">
        <section className="w-full max-w-container-max relative overflow-hidden rounded-xl bg-inverse-surface p-stack-lg md:p-24 flex flex-col items-center text-center shadow-lg border border-white/5">
          <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 20% 30%, #104af0 0%, transparent 40%), radial-gradient(circle at 80% 70%, #6b38d4 0%, transparent 40%)' }}></div>
          <div className="relative z-10 space-y-stack-md max-w-2xl">
            <h1 className="font-headline-lg text-headline-lg md:text-display-xl md:font-display-xl text-inverse-on-surface">
              Ready to get started?
            </h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant/80">
              Join over 10,000+ teams building the future of SaaS with our powerful, luminous utility platform.
            </p>
            <div className="pt-stack-md">
              <button className="bg-primary text-on-primary font-bold py-4 px-10 rounded-lg hover:shadow-[0_0_20px_rgba(16,74,240,0.4)] transition-all duration-300 active:scale-95 transform">
                Start Free Trial
              </button>
            </div>
          </div>
          <div className="absolute bottom-0 right-0 w-64 h-64 opacity-10 pointer-events-none">
            <img alt="" className="w-full h-full object-contain" src="https://lh3.googleusercontent.com/aida-public/AB6AXuC9eisT02XQ1zdobDD_V0BgzTbv-DOeb_0zg1p494Y3sSO2DSQd2xdVK2jOA4sBfZb3sZplZJASX7Vjt3AlsV2c7TsGGK42PXAPh1mSaDk5HWmEwvjbDcJ-CUWkdlnEVIO3UWOpXP1LldVSNgSQwdaqvpOaPSXRF0ZJ7QfZnheyjAqYXLC6IYHqDamrl9i_Pf95KgV7VZniDVV6w1ufGivqqCGGcRgRfB-Iy9GijHNyMdnvqLKwLHH5PRfg8_Dph0EC_xMk0XoaFwo" />
          </div>
        </section>
      </main>
      <footer className="bg-surface border-t border-outline-variant/10 shadow-sm">
        <div className="max-w-container-max mx-auto px-margin-page py-stack-lg flex flex-col gap-stack-lg">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-gutter">
            <div className="flex flex-col gap-stack-sm">
              <h3 className="font-headline-md text-headline-md text-primary font-black mb-2">Product</h3>
              <ul className="flex flex-col gap-unit">
                <li><a className="text-on-surface-variant hover:text-primary transition-colors duration-200 font-body-md text-body-md" href="#">Features</a></li>
                <li><a className="text-on-surface-variant hover:text-primary transition-colors duration-200 font-body-md text-body-md" href="#">Pricing</a></li>
                <li><a className="text-on-surface-variant hover:text-primary transition-colors duration-200 font-body-md text-body-md" href="#">Integrations</a></li>
                <li><a className="text-on-surface-variant hover:text-primary transition-colors duration-200 font-body-md text-body-md" href="#">Changelog</a></li>
              </ul>
            </div>
            <div className="flex flex-col gap-stack-sm">
              <h3 className="font-headline-md text-headline-md text-primary font-black mb-2">Company</h3>
              <ul className="flex flex-col gap-unit">
                <li><a className="text-on-surface-variant hover:text-primary transition-colors duration-200 font-body-md text-body-md" href="#">About</a></li>
                <li><a className="text-on-surface-variant hover:text-primary transition-colors duration-200 font-body-md text-body-md" href="#">Careers</a></li>
                <li><a className="text-on-surface-variant hover:text-primary transition-colors duration-200 font-body-md text-body-md" href="#">Press</a></li>
                <li><a className="text-on-surface-variant hover:text-primary transition-colors duration-200 font-body-md text-body-md" href="#">Contact</a></li>
              </ul>
            </div>
            <div className="flex flex-col gap-stack-sm">
              <h3 className="font-headline-md text-headline-md text-primary font-black mb-2">Resources</h3>
              <ul className="flex flex-col gap-unit">
                <li><a className="text-on-surface-variant hover:text-primary transition-colors duration-200 font-body-md text-body-md" href="#">Documentation</a></li>
                <li><a className="text-on-surface-variant hover:text-primary transition-colors duration-200 font-body-md text-body-md" href="#">Help Center</a></li>
                <li><a className="text-on-surface-variant hover:text-primary transition-colors duration-200 font-body-md text-body-md" href="#">Community</a></li>
                <li><a className="text-on-surface-variant hover:text-primary transition-colors duration-200 font-body-md text-body-md" href="#">Blog</a></li>
              </ul>
            </div>
            <div className="flex flex-col gap-stack-sm">
              <h3 className="font-headline-md text-headline-md text-primary font-black mb-2">Legal</h3>
              <ul className="flex flex-col gap-unit">
                <li><a className="text-on-surface-variant hover:text-primary transition-colors duration-200 font-body-md text-body-md" href="#">Privacy Policy</a></li>
                <li><a className="text-on-surface-variant hover:text-primary transition-colors duration-200 font-body-md text-body-md" href="#">Terms of Service</a></li>
                <li><a className="text-on-surface-variant hover:text-primary transition-colors duration-200 font-body-md text-body-md" href="#">Security</a></li>
                <li><a className="text-on-surface-variant hover:text-primary transition-colors duration-200 font-body-md text-body-md" href="#">Cookie Policy</a></li>
              </ul>
            </div>
            <div className="flex flex-col gap-stack-sm col-span-2 lg:col-span-1">
              <h3 className="font-headline-md text-headline-md text-primary font-black mb-2">Newsletter</h3>
              <p className="text-on-surface-variant font-body-md text-body-md mb-2">Subscribe for the latest updates.</p>
              <form className="flex flex-col gap-stack-sm" onSubmit={(e) => e.preventDefault()}>
                <input className="bg-[#F8FAFC] border border-outline px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all" placeholder="Email address" type="email" />
                <button className="bg-primary text-on-primary font-bold py-2 px-6 rounded-lg hover:shadow-md transition-shadow active:scale-95 transition-transform duration-200">
                  Subscribe
                </button>
              </form>
            </div>
          </div>
          <div className="pt-stack-lg border-t border-outline-variant/10 flex flex-col md:flex-row justify-between items-center gap-stack-md">
            <div className="flex items-center gap-stack-sm">
              <span className="font-headline-md text-headline-md text-primary font-black">Luminous Utility</span>
            </div>
            <div className="flex items-center gap-stack-md">
              <a className="text-on-surface-variant hover:text-primary transition-colors duration-200" href="#" title="Twitter">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: 'FILL 0' }}>brand_awareness</span>
              </a>
              <a className="text-on-surface-variant hover:text-primary transition-colors duration-200" href="#" title="LinkedIn">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: 'FILL 1' }}>share</span>
              </a>
              <a className="text-on-surface-variant hover:text-primary transition-colors duration-200" href="#" title="GitHub">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: 'FILL 0' }}>terminal</span>
              </a>
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant">
              © 2024 Luminous Utility. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default FooterCTA;