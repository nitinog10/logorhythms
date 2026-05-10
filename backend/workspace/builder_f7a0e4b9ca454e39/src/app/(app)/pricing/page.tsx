'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';

type Plan = {
  id: string;
  name: string;
  price: number;
  features: string[];
};

const PricingPage = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const response = await axios.get('/api/plans');
        setPlans(response.data);
        setLoading(false);
      } catch (err) {
        setError('Failed to load plans');
        setLoading(false);
      }
    };

    fetchPlans();
  }, []);

  if (loading) return <p>Loading...</p>;
  if (error) return <p>{error}</p>;

  return (
    <div className="bg-surface font-body-md text-on-surface">
      <header className="fixed top-0 w-full z-50 bg-surface/80 dark:bg-surface-dim/80 backdrop-blur-md shadow-sm">
        <nav className="flex justify-between items-center h-20 px-margin max-w-container-max mx-auto">
          <div className="font-h3 text-h3 font-bold text-primary dark:text-primary-fixed">SaaSify</div>
          <div className="hidden md:flex items-center gap-gutter font-body-md text-body-md">
            <a className="text-on-surface-variant dark:text-surface-variant hover:text-primary dark:hover:text-primary-fixed transition-colors" href="#">Features</a>
            <a className="text-primary dark:text-primary-fixed font-bold border-b-2 border-primary hover:text-primary dark:hover:text-primary-fixed transition-colors" href="#">Pricing</a>
            <a className="text-on-surface-variant dark:text-surface-variant hover:text-primary dark:hover:text-primary-fixed transition-colors" href="#">About</a>
            <a className="text-on-surface-variant dark:text-surface-variant hover:text-primary dark:hover:text-primary-fixed transition-colors" href="#">Contact</a>
          </div>
          <div className="flex items-center gap-stack-md">
            <button className="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-all duration-200">Log In</button>
            <button className="bg-primary-container text-on-primary-container px-gutter py-stack-sm rounded-lg font-bold hover:opacity-90 transition-all duration-200 shadow-md">Get Started</button>
          </div>
        </nav>
      </header>
      <main className="pt-32 pb-stack-lg">
        <section className="max-w-container-max mx-auto px-margin text-center mb-stack-lg">
          <h1 className="font-h1 text-h1 text-on-surface mb-stack-sm">Simple, transparent pricing</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl mx-auto mb-stack-lg">
            Choose the perfect plan for your business needs. No hidden fees, cancel anytime.
          </p>
          <div className="flex items-center justify-center gap-stack-md mb-stack-lg">
            <span className="font-label-sm text-label-sm text-on-surface">Monthly</span>
            <div className="relative flex items-center p-1 bg-surface-container rounded-full w-48 h-12">
              <div className="absolute inset-y-1 left-1 w-[calc(50%-4px)] bg-primary rounded-full transition-transform duration-300 transform translate-x-full"></div>
              <button className="relative z-10 w-1/2 text-on-surface-variant text-label-sm font-bold">Monthly</button>
              <button className="relative z-10 w-1/2 text-on-primary text-label-sm font-bold">Annual</button>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-label-sm text-label-sm text-on-surface">Annual</span>
              <span className="bg-secondary-container text-on-secondary-container text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Save 20%</span>
            </div>
          </div>
        </section>
        <section className="max-w-container-max mx-auto px-margin grid grid-cols-1 md:grid-cols-3 gap-gutter mb-32">
          {plans.map((plan) => (
            <div key={plan.id} className={`glass-card p-stack-lg rounded-xl flex flex-col shadow-sm hover:shadow-md transition-all ${plan.name === 'Pro'? 'relative bg-surface-container-lowest border-2 border-primary transform scale-105 z-10' : ''}`}>
              {plan.name === 'Pro' && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-primary text-on-primary px-4 py-1 rounded-full text-label-sm font-bold uppercase tracking-widest shadow-lg">
                  Best Value
                </div>
              )}
              <div className="mb-stack-md">
                <h3 className="font-h3 text-h3 text-on-surface mb-2">{plan.name}</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-h2 font-h2 text-primary">{plan.price === 0? 'Custom' : `$${plan.price}`}</span>
                  {plan.price!== 0 && <span className="text-on-surface-variant font-body-md">/mo</span>}
                </div>
              </div>
              <ul className="flex-grow space-y-stack-sm mb-stack-lg">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-center gap-2 text-on-surface-variant">
                    <span className="material-symbols-outlined text-primary text-[20px]">check_circle</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <button className={`w-full ${plan.name === 'Pro'? 'bg-primary text-on-primary' : 'border-2 border-primary text-primary'} py-stack-sm rounded-lg font-bold hover:opacity-90 transition-opacity ${plan.name === 'Pro'? 'shadow-lg' : ''}`}>
                {plan.name === 'Pro'? 'Start Free Trial' : 'Get Started'}
              </button>
            </div>
          ))}
        </section>
        <section className="max-w-container-max mx-auto px-margin">
          <div className="text-center mb-stack-lg">
            <h2 className="font-h2 text-h2 text-on-surface mb-4">Compare Features</h2>
            <div className="h-1 w-20 bg-primary mx-auto rounded-full"></div>
          </div>
          <div className="overflow-x-auto bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low">
                  <th className="p-6 font-h3 text-h3 text-on-surface w-1/3">Features</th>
                  <th className="p-6 font-label-sm text-label-sm text-center">Starter</th>
                  <th className="p-6 font-label-sm text-label-sm text-center text-primary">Pro</th>
                  <th className="p-6 font-label-sm text-label-sm text-center">Enterprise</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                <tr>
                  <td className="p-6 font-body-md text-on-surface font-semibold">Max Team Members</td>
                  <td className="p-6 text-center text-on-surface-variant">2</td>
                  <td className="p-6 text-center text-on-surface font-bold">15</td>
                  <td className="p-6 text-center text-on-surface-variant">Unlimited</td>
                </tr>
                <tr>
                  <td className="p-6 font-body-md text-on-surface font-semibold">Storage Capacity</td>
                  <td className="p-6 text-center text-on-surface-variant">1 GB</td>
                  <td className="p-6 text-center text-on-surface font-bold">10 GB</td>
                  <td className="p-6 text-center text-on-surface-variant">Unlimited</td>
                </tr>
                <tr>
                  <td className="p-6 font-body-md text-on-surface font-semibold">Advanced Analytics</td>
                  <td className="p-6 text-center"><span className="material-symbols-outlined text-outline">remove</span></td>
                  <td className="p-6 text-center"><span className="material-symbols-outlined text-primary" data-weight="fill" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span></td>
                  <td className="p-6 text-center"><span className="material-symbols-outlined text-primary" data-weight="fill" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span></td>
                </tr>
                <tr>
                  <td className="p-6 font-body-md text-on-surface font-semibold">Custom Domain</td>
                  <td className="p-6 text-center"><span className="material-symbols-outlined text-outline">remove</span></td>
                  <td className="p-6 text-center"><span className="material-symbols-outlined text-primary" data-weight="fill" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span></td>
                  <td className="p-6 text-center"><span className="material-symbols-outlined text-primary" data-weight="fill" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span></td>
                </tr>
                <tr>
                  <td className="p-6 font-body-md text-on-surface font-semibold">White-label reports</td>
                  <td className="p-6 text-center"><span className="material-symbols-outlined text-outline">remove</span></td>
                  <td className="p-6 text-center"><span className="material-symbols-outlined text-primary" data-weight="fill" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span></td>
                  <td className="p-6 text-center"><span className="material-symbols-outlined text-primary" data-weight="fill" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span></td>
                </tr>
                <tr>
                  <td className="p-6 font-body-md text-on-surface font-semibold">SSO Authentication</td>
                  <td className="p-6 text-center"><span className="material-symbols-outlined text-outline">remove</span></td>
                  <td className="p-6 text-center"><span className="material-symbols-outlined text-outline">remove</span></td>
                  <td className="p-6 text-center"><span className="material-symbols-outlined text-primary" data-weight="fill" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span></td>
                </tr>
                <tr>
                  <td className="p-6 font-body-md text-on-surface font-semibold">24/7 Phone Support</td>
                  <td className="p-6 text-center"><span className="material-symbols-outlined text-outline">remove</span></td>
                  <td className="p-6 text-center"><span className="material-symbols-outlined text-outline">remove</span></td>
                  <td className="p-6 text-center"><span className="material-symbols-outlined text-primary" data-weight="fill" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        <section className="max-w-container-max mx-auto px-margin mt-stack-lg">
          <div className="bg-primary-container rounded-xl p-stack-lg text-center shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full blur-2xl -ml-24 -mb-24"></div>
            <h2 className="font-h2 text-h2 text-on-primary-container mb-stack-sm relative z-10">Ready to boost your productivity?</h2>
            <p className="font-body-lg text-body-lg text-on-primary-container/80 mb-stack-md relative z-10">Join over 10,000+ companies growing with SaaSify.</p>
            <div className="flex flex-col md:flex-row justify-center gap-stack-md relative z-10">
              <button className="bg-surface-container-lowest text-primary px-stack-lg py-stack-sm rounded-lg font-bold hover:shadow-lg transition-all">Start 14-day Free Trial</button>
              <button className="bg-primary-fixed-dim/20 text-on-primary-container border border-on-primary-container/20 px-stack-lg py-stack-sm rounded-lg font-bold backdrop-blur-sm hover:bg-white/10 transition-all">Schedule a Demo</button>
            </div>
          </div>
        </section>
      </main>
      <footer className="w-full py-stack-lg bg-surface-container-low dark:bg-inverse-surface border-t border-outline-variant">
        <div className="flex flex-col md:flex-row justify-between items-center px-margin max-w-container-max mx-auto gap-gutter">
          <div className="flex flex-col gap-stack-sm">
            <div className="font-h3 text-h3 font-bold text-primary dark:text-primary-fixed">SaaSify</div>
            <p className="text-on-surface-variant dark:text-surface-variant max-w-xs">Building the future of professional software management, one feature at a time.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-gutter font-body-md text-body-md">
            <a className="text-on-surface-variant dark:text-surface-variant hover:text-primary transition-opacity duration-200" href="#">Privacy Policy</a>
            <a className="text-on-surface-variant dark:text-surface-variant hover:text-primary transition-opacity duration-200" href="#">Terms of Service</a>
            <a className="text-on-surface-variant dark:text-surface-variant hover:text-primary transition-opacity duration-200" href="#">Cookie Policy</a>
            <a className="text-on-surface-variant dark:text-surface-variant hover:text-primary transition-opacity duration-200" href="#">Status</a>
          </div>
          <div className="flex flex-col items-end gap-stack-sm">
            <div className="flex gap-stack-md">
              <span className="material-symbols-outlined text-on-surface-variant cursor-pointer hover:text-primary">language</span>
              <span className="material-symbols-outlined text-on-surface-variant cursor-pointer hover:text-primary">public</span>
              <span className="material-symbols-outlined text-on-surface-variant cursor-pointer hover:text-primary">hub</span>
            </div>
            <div className="text-on-surface-variant dark:text-surface-variant font-body-md text-body-md">© 2024 SaaSify Inc. All rights reserved.</div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PricingPage;