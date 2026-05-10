'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';

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

const PricingPage = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const plansResponse = await axios.get('/api/plans');
        const testimonialsResponse = await axios.get('/api/testimonials');
        setPlans(plansResponse.data);
        setTestimonials(testimonialsResponse.data);
        setLoading(false);
      } catch (err) {
        setError('Failed to load data');
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) return <p>Loading...</p>;
  if (error) return <p>{error}</p>;

  return (
    <div className="bg-background text-on-background font-body-md mesh-gradient-bg min-h-screen overflow-x-hidden">
      <header className="bg-surface/70 backdrop-blur-xl fixed top-0 w-full z-50 border-b border-white/10 shadow-lg shadow-blue-900/5">
        <div className="flex justify-between items-center w-full px-margin-page py-4 max-w-container-max mx-auto">
          <div className="flex items-center gap-8">
            <span className="text-headline-md font-headline-md font-black text-primary tracking-tight">Lumina</span>
            <nav className="hidden md:flex gap-6 items-center">
              <a className="text-on-surface-variant font-medium hover:text-primary transition-colors hover:bg-primary/5 rounded-lg px-3 py-1" href="#">Product</a>
              <a className="text-primary font-bold border-b-2 border-primary pb-1" href="#">Pricing</a>
              <a className="text-on-surface-variant font-medium hover:text-primary transition-colors hover:bg-primary/5 rounded-lg px-3 py-1" href="#">Enterprise</a>
              <a className="text-on-surface-variant font-medium hover:text-primary transition-colors hover:bg-primary/5 rounded-lg px-3 py-1" href="#">Resources</a>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <button className="text-on-surface-variant font-medium hover:text-primary transition-colors px-4 py-2 rounded-lg">Sign In</button>
            <button className="bg-primary text-on-primary font-bold px-6 py-2 rounded-full shadow-md hover:scale-95 transition-transform duration-200">Get Started</button>
          </div>
        </div>
      </header>
      <main className="max-w-container-max mx-auto px-margin-page py-stack-lg">
        <section className="text-center mb-stack-lg">
          <h1 className="font-display-xl text-display-xl text-on-background mb-stack-sm tracking-tight">Simple, transparent pricing</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl mx-auto mb-stack-md">Choose the plan that's right for your team. Scale as you grow with Luminous Utility.</p>
          <div className="flex items-center justify-center gap-4 mb-stack-md">
            <span className="font-label-sm text-on-surface-variant">Monthly</span>
            <button className="w-14 h-8 bg-surface-container-highest rounded-full p-1 transition-all duration-300 relative group">
              <div className="w-6 h-6 bg-primary rounded-full shadow-sm transform translate-x-6 transition-transform"></div>
            </button>
            <span className="font-label-sm text-primary font-bold">Annual <span className="bg-primary/10 px-2 py-0.5 rounded text-[10px] ml-1">SAVE 20%</span></span>
          </div>
        </section>
        <section className="grid grid-cols-1 md:grid-cols-3 gap-gutter items-stretch mb-stack-lg">
          {plans.map((plan) => (
            <div key={plan.id} className={`glass-card p-8 rounded-xl flex flex-col shadow-xl shadow-blue-900/5 hover:scale-[1.02] transition-all duration-300 ${plan.name.toLowerCase() === 'pro'? 'relative scale-105 z-10 border-2 border-primary' : ''}`}>
              {plan.name.toLowerCase() === 'pro' && <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-on-primary px-4 py-1 rounded-full font-label-sm uppercase tracking-widest text-[10px]">Recommended</div>}
              <div className="mb-8">
                <h3 className="font-headline-md text-headline-md text-on-surface mb-2">{plan.name}</h3>
                <div className="flex items-baseline gap-1">
                  <span className={`font-display-xl text-headline-lg font-bold ${plan.name.toLowerCase() === 'pro'? 'text-primary' : ''}`}>{plan.price === 0? 'Custom' : `$${plan.price}`}</span>
                  {plan.price!== 0 && <span className="text-on-surface-variant">/mo</span>}
                </div>
                <p className="text-on-surface-variant text-sm mt-2">{plan.name.toLowerCase() === 'starter'? 'Essential features for individuals.' : plan.name.toLowerCase() === 'pro'? 'Power tools for growing teams.' : 'Security and scale for corporations.'}</p>
              </div>
              <ul className="space-y-4 mb-10 flex-grow">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary text-[20px]">check_circle</span>
                    <span className={plan.name.toLowerCase() === 'pro'? 'text-dark' : 'text-on-surface-variant'}>{feature}</span>
                  </li>
                ))}
              </ul>
              <button className={`w-full py-3 rounded-lg ${plan.name.toLowerCase() === 'pro'? 'bg-primary text-on-primary font-bold shadow-lg shadow-primary/20 hover:scale-[0.98] transition-transform' : 'border border-outline-variant font-bold text-primary hover:bg-primary/5 transition-all'}`}>
                {plan.name.toLowerCase() === 'pro'? 'Start Free Trial' : 'Get Started'}
              </button>
            </div>
          ))}
        </section>
        <section className="mt-stack-lg">
          <h2 className="font-headline-lg text-headline-lg text-center mb-stack-md tracking-tight">Compare all features</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/30 text-left">
                  <th className="py-6 px-4 font-headline-md text-on-surface">Features</th>
                  <th className="py-6 px-4 font-label-sm uppercase tracking-wider text-on-surface-variant">Starter</th>
                  <th className="py-6 px-4 font-label-sm uppercase tracking-wider text-primary">Pro</th>
                  <th className="py-6 px-4 font-label-sm uppercase tracking-wider text-on-surface-variant">Enterprise</th>
                </tr>
              </thead>
              <tbody className="text-body-md text-on-surface-variant">
                <tr>
                  <td className="py-4 px-4 font-medium text-on-surface">Data Retention</td>
                  <td className="py-4 px-4">24 Hours</td>
                  <td className="py-4 px-4 text-primary font-semibold">30 Days</td>
                  <td className="py-4 px-4">Unlimited</td>
                </tr>
                <tr>
                  <td className="py-4 px-4 font-medium text-on-surface">Integrations</td>
                  <td className="py-4 px-4">Slack, Discord</td>
                  <td className="py-4 px-4 text-primary font-semibold">Everything + API</td>
                  <td className="py-4 px-4">Custom Built</td>
                </tr>
                <tr>
                  <td className="py-4 px-4 font-medium text-on-surface">Support</td>
                  <td className="py-4 px-4">Community</td>
                  <td className="py-4 px-4 text-primary font-semibold">Priority Email</td>
                  <td className="py-4 px-4">24/7 Dedicated</td>
                </tr>
                <tr>
                  <td className="py-4 px-4 font-medium text-on-surface">Security</td>
                  <td className="py-4 px-4">Standard</td>
                  <td className="py-4 px-4 text-primary font-semibold">Advanced</td>
                  <td className="py-4 px-4">SSO, SOC2, HIPAA</td>
                </tr>
                <tr>
                  <td className="py-4 px-4 font-medium text-on-surface">Custom Branding</td>
                  <td className="py-4 px-4">—</td>
                  <td className="py-4 px-4 text-primary font-semibold">
                    <span className="material-symbols-outlined">check</span>
                  </td>
                  <td className="py-4 px-4">
                    <span className="material-symbols-outlined">check</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        <section className="mt-stack-lg glass-card rounded-3xl p-stack-md text-center overflow-hidden relative">
          <div className="absolute inset-0 opacity-10 bg-gradient-to-r from-primary to-secondary"></div>
          <div className="relative z-10">
            <h2 className="font-headline-lg text-headline-lg mb-4">Ready to accelerate your workflow?</h2>
            <p className="mb-8 text-on-surface-variant max-w-xl mx-auto">Join over 10,000+ teams using Lumina to build the future of SaaS. Start your 14-day free trial on any plan.</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button className="bg-primary text-on-primary px-8 py-4 rounded-full font-bold shadow-xl shadow-primary/20 hover:scale-95 transition-transform">Get Started Now</button>
              <button className="border border-outline-variant bg-white/50 px-8 py-4 rounded-full font-bold hover:bg-white transition-all">Talk to an Expert</button>
            </div>
          </div>
        </section>
      </main>
      <footer className="bg-surface-container-lowest w-full py-stack-lg border-t border-outline-variant/30">
        <div className="max-w-container-max mx-auto px-margin-page flex flex-col md:flex-row justify-between items-center gap-stack-md">
          <div className="flex flex-col items-center md:items-start gap-2">
            <span className="font-headline-md text-primary font-black">Lumina</span>
            <p className="text-on-surface-variant font-label-sm text-center md:text-left">© 2024 Lumina Systems. Engineered for speed.</p>
          </div>
          <div className="flex gap-8">
            <a className="text-on-surface-variant hover:text-primary transition-colors hover:underline decoration-primary/30" href="#">Terms</a>
            <a className="text-on-surface-variant hover:text-primary transition-colors hover:underline decoration-primary/30" href="#">Privacy</a>
            <a className="text-on-surface-variant hover:text-primary transition-colors hover:underline decoration-primary/30" href="#">Support</a>
            <a className="text-on-surface-variant hover:text-primary transition-colors hover:underline decoration-primary/30" href="#">API</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PricingPage;