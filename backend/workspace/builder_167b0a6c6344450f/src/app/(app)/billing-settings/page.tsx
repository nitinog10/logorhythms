'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';

type User = {
  id: string;
  email: string;
  name: string;
  status: 'active' | 'trial' | 'churned' | 'suspended';
  createdAt: Date;
};

type Subscription = {
  id: string;
  userId: string;
  plan: 'starter' | 'pro' | 'enterprise';
  billingCycle: 'monthly' | 'yearly';
  createdAt: Date;
};

type APIUsage = {
  id: string;
  userId: string;
  endpoint: string;
  method: string;
  avgLatency: number;
  errorRate: number;
};

type Revenue = {
  id: string;
  userId: string;
  amount: number;
  date: Date;
};

const BillingSettings = () => {
  const [user, setUser] = useState<User | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [apiUsage, setApiUsage] = useState<APIUsage[]>([]);
  const [revenue, setRevenue] = useState<Revenue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const userResponse = await axios.get('/api/user');
        const subscriptionResponse = await axios.get('/api/subscription');
        const apiUsageResponse = await axios.get('/api/api-usage');
        const revenueResponse = await axios.get('/api/revenue');

        setUser(userResponse.data);
        setSubscription(subscriptionResponse.data);
        setApiUsage(apiUsageResponse.data);
        setRevenue(revenueResponse.data);
        setIsLoading(false);
      } catch (err) {
        setError('Failed to load data');
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div className="flex min-h-screen">
      <aside className="docked left-0 h-screen w-64 flex flex-col h-full py-8 bg-surface-container-low dark:bg-surface-container-low border-r border-outline-variant dark:border-outline-variant fixed z-50">
        <div className="px-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-container rounded-lg flex items-center justify-center text-on-primary-container">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>insights</span>
            </div>
            <div>
              <h1 className="font-display-lg text-headline-md font-bold text-on-surface dark:text-on-surface leading-tight">Flux Analytics</h1>
              <p className="text-body-sm text-on-surface-variant opacity-70">Enterprise Tier</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          <a className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-on-surface-variant dark:text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/50 transition-colors duration-200 font-body-base text-body-base" href="#">
            <span className="material-symbols-outlined">dashboard</span>
            <span>Dashboard</span>
          </a>
          <a className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-on-surface-variant dark:text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/50 transition-colors duration-200 font-body-base text-body-base" href="#">
            <span className="material-symbols-outlined">analytics</span>
            <span>Analytics</span>
          </a>
          <a className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-on-surface-variant dark:text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/50 transition-colors duration-200 font-body-base text-body-base" href="#">
            <span className="material-symbols-outlined">subscriptions</span>
            <span>Subscriptions</span>
          </a>
          <a className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-primary dark:text-primary font-bold border-r-2 border-primary bg-surface-variant/30 font-body-base text-body-base" href="#">
            <span className="material-symbols-outlined">receipt_long</span>
            <span>Billing</span>
          </a>
          <a className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-on-surface-variant dark:text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/50 transition-colors duration-200 font-body-base text-body-base" href="#">
            <span className="material-symbols-outlined">settings</span>
            <span>Settings</span>
          </a>
        </nav>
        <div className="mt-auto px-3 space-y-1">
          <a className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-on-surface-variant hover:text-on-surface transition-colors" href="#">
            <span className="material-symbols-outlined">help</span>
            <span>Support</span>
          </a>
          <a className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-on-surface-variant hover:text-on-surface transition-colors" href="#">
            <span className="material-symbols-outlined">description</span>
            <span>Documentation</span>
          </a>
        </div>
      </aside>
      <main className="flex-1 ml-64 min-w-0">
        <header className="docked full-width top-0 sticky z-40 flex justify-between items-center h-16 px-6 w-full bg-surface/70 dark:bg-surface/70 backdrop-blur-md border-b border-outline-variant dark:border-outline-variant">
          <div className="flex items-center gap-6">
            <h2 className="font-display-lg text-headline-md font-bold text-primary dark:text-primary">Billing & Subscriptions</h2>
            <div className="relative hidden lg:block">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-body-base">search</span>
              <input className="bg-surface-container-lowest border border-outline-variant rounded-full py-1.5 pl-10 pr-4 text-body-sm focus:outline-none focus:ring-2 focus:ring-primary/50 w-64" placeholder="Search billing history..." type="text"/>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button className="w-10 h-10 flex items-center justify-center text-on-surface-variant hover:bg-surface-variant/30 rounded-full transition-colors duration-200">
              <span className="material-symbols-outlined">notifications</span>
            </button>
            <button className="w-10 h-10 flex items-center justify-center text-on-surface-variant hover:bg-surface-variant/30 rounded-full transition-colors duration-200">
              <span className="material-symbols-outlined">help_outline</span>
            </button>
            <div className="h-8 w-px bg-outline-variant mx-2"></div>
            <img alt="User Profile" className="w-8 h-8 rounded-full border border-outline-variant" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAnCfr7d1fpOeOnuj6LwZMmeVjH9in9GjImUwufGIln0l34O9eI_iTQEATLsBkcGC8IbCRD-ERcyQ6xfm0JvO8zZ4Bg3cr6iLAZGDtlt0VQ1dAVPoUY6Tzo7gMfZQl8Jbq5eXFzKp0wM0B0aGSoCGtbuzr4t-P8GaQxERo0IiYwW85UjW9d24n-sPGQeqGTYMX5B7GHHRkp8vzKQyDaS-csbBaXqXmm3VwYHcCd6jgHhqMzW3bTBkW1ATnMcrSibxlLpF--LydAG48"/>
          </div>
        </header>
        <div className="p-6 max-w-7xl mx-auto space-y-8">
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1 glass-panel rounded-xl p-5 glow-accent flex flex-col justify-between border border-outline-variant">
              <div>
                <span className="font-label-caps text-primary uppercase tracking-wider mb-2 block">Active Subscription</span>
                <h3 className="font-headline-md text-headline-md text-on-surface mb-1">Pro Plan</h3>
                <p className="text-body-sm text-on-surface-variant mb-6">Billed monthly at $149.00 USD</p>
              </div>
              <div className="flex flex-col gap-3">
                <button className="w-full bg-primary text-on-primary font-bold py-2.5 rounded-lg hover:opacity-90 transition-opacity active:scale-95 duration-150">
                  Upgrade Plan
                </button>
                <button className="w-full border border-outline-variant text-on-surface font-medium py-2.5 rounded-lg hover:bg-surface-variant/30 transition-colors">
                  Cancel Subscription
                </button>
              </div>
            </div>
            <div className="lg:col-span-2 glass-panel rounded-xl p-5 border border-outline-variant">
              <h4 className="font-headline-md text-body-base font-bold mb-6">Resource Usage (Current Period)</h4>
              <div className="space-y-6">
                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <span className="text-body-sm font-medium">API Calls</span>
                    <span className="font-data-mono text-body-sm">85,420 / 100,000</span>
                  </div>
                  <div className="h-2 w-full bg-surface-container-highest rounded-full overflow-hidden">
                    <div className="h-full bg-primary w-[85%] rounded-full shadow-[0_0_8px_rgba(139,92,246,0.5)]"></div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <span className="text-body-sm font-medium">Object Storage</span>
                    <span className="font-data-mono text-body-sm">1.2TB / 2.0TB</span>
                  </div>
                  <div className="h-2 w-full bg-surface-container-highest rounded-full overflow-hidden">
                    <div className="h-full bg-primary w-[60%] rounded-full shadow-[0_0_8px_rgba(139,92,246,0.5)]"></div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <span className="text-body-sm font-medium">Team Members</span>
                    <span className="font-data-mono text-body-sm">8 / 10 Seats</span>
                  </div>
                  <div className="h-2 w-full bg-surface-container-highest rounded-full overflow-hidden">
                    <div className="h-full bg-primary w-[80%] rounded-full shadow-[0_0_8px_rgba(139,92,246,0.5)]"></div>
                  </div>
                </div>
              </div>
            </div>
          </section>
          <section>
            <div className="mb-4">
              <h3 className="font-headline-md text-headline-md">Change Your Plan</h3>
              <p className="text-body-sm text-on-surface-variant">Switch between tiers to match your scaling needs.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="glass-panel rounded-xl p-5 border border-outline-variant flex flex-col h-full">
                <div className="mb-6">
                  <h4 className="text-body-base font-bold text-on-surface">Starter</h4>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-headline-md font-bold">$0</span>
                    <span className="text-body-sm text-on-surface-variant">/mo</span>
                  </div>
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  <li className="flex items-center gap-3 text-body-sm text-on-surface-variant">
                    <span className="material-symbols-outlined text-primary text-sm">check_circle</span>
                    <span>5k API Calls / mo</span>
                  </li>
                  <li className="flex items-center gap-3 text-body-sm text-on-surface-variant">
                    <span className="material-symbols-outlined text-primary text-sm">check_circle</span>
                    <span>10GB Cloud Storage</span>
                  </li>
                  <li className="flex items-center gap-3 text-body-sm text-on-surface-variant">
                    <span className="material-symbols-outlined text-primary text-sm">check_circle</span>
                    <span>Single User License</span>
                  </li>
                </ul>
                <button className="w-full border border-outline-variant py-2 rounded-lg text-body-sm font-medium hover:bg-surface-variant/30">Downgrade</button>
              </div>
              <div className="relative glass-panel rounded-xl p-5 border-2 border-primary flex flex-col h-full ring-4 ring-primary/10">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-on-primary px-3 py-0.5 rounded-full text-xs font-bold tracking-widest uppercase">Current Plan</div>
                <div className="mb-6">
                  <h4 className="text-body-base font-bold text-on-surface">Pro</h4>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-headline-md font-bold">$149</span>
                    <span className="text-body-sm text-on-surface-variant">/mo</span>
                  </div>
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  <li className="flex items-center gap-3 text-body-sm">
                    <span className="material-symbols-outlined text-primary text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    <span>100k API Calls / mo</span>
                  </li>
                  <li className="flex items-center gap-3 text-body-sm">
                    <span className="material-symbols-outlined text-primary text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    <span>2TB Cloud Storage</span>
                  </li>
                  <li className="flex items-center gap-3 text-body-sm">
                    <span className="material-symbols-outlined text-primary text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    <span>10 Team Members</span>
                  </li>
                  <li className="flex items-center gap-3 text-body-sm">
                    <span className="material-symbols-outlined text-primary text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    <span>Advanced Analytics Dashboard</span>
                  </li>
                </ul>
                <button className="w-full bg-primary/20 text-primary border border-primary/30 py-2 rounded-lg text-body-sm font-bold cursor-default">Active Plan</button>
              </div>
              <div className="glass-panel rounded-xl p-5 border border-outline-variant flex flex-col h-full">
                <div className="mb-6">
                  <h4 className="text-body-base font-bold text-on-surface">Enterprise</h4>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-headline-md font-bold">Custom</span>
                  </div>
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  <li className="flex items-center gap-3 text-body-sm text-on-surface-variant">
                    <span className="material-symbols-outlined text-primary text-sm">check_circle</span>
                    <span>Unlimited API Calls</span>
                  </li>
                  <li className="flex items-center gap-3 text-body-sm text-on-surface-variant">
                    <span className="material-symbols-outlined text-primary text-sm">check_circle</span>
                    <span>Custom Storage Quotas</span>
                  </li>
                  <li className="flex items-center gap-3 text-body-sm text-on-surface-variant">
                    <span className="material-symbols-outlined text-primary text-sm">check_circle</span>
                    <span>SSO & Audit Logs</span>
                  </li>
                  <li className="flex items-center gap-3 text-body-sm text-on-surface-variant">
                    <span className="material-symbols-outlined text-primary text-sm">check_circle</span>
                    <span>24/7 Priority Support</span>
                  </li>
                </ul>
                <button className="w-full border border-outline-variant py-2 rounded-lg text-body-sm font-medium hover:bg-surface-variant/30">Contact Sales</button>
              </div>
            </div>
          </section>
          <section className="glass-panel rounded-xl p-5 border border-outline-variant">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="font-headline-md text-headline-md">Payment Method</h3>
                <p className="text-body-sm text-on-surface-variant">Manage your billing details and preferences.</p>
              </div>
              <button className="flex items-center gap-2 text-primary font-bold hover:bg-primary/10 px-4 py-2 rounded-lg transition-colors">
                <span className="material-symbols-outlined">add</span>
                <span>Add New</span>
              </button>
            </div>
            <div className="bg-surface-container-highest/30 rounded-lg p-4 border border-outline-variant flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-8 bg-[#1A1F2C] rounded flex items-center justify-center border border-outline-variant overflow-hidden">
                  <img alt="Visa" className="h-4 object-contain" src="https://lh3.googleusercontent.com/aida-public/AB6AXuD6pgQ3gm45IOIGFeoUOZdRE2q-TwzNzGmQaBVww49DnveMdqXOUIYIzj18nU_xrjkKKSxrlPz9KRwFeTHfJZHy2_80052xh9a_VhcS0hmeRwV0Nv8btpwNKFor5HmywTJ0WWmKrFnCXgxUirom0amm6DzLs_mA_7ipno5-hMah5hX9SmpTSfzQ-4G56UpdtPfY2VpkcyLGXT0HoMLY2lTaMpX8U6MpkqF3dKB1bSdvsncvqkh4I02PPcwKpsLQLbcK0PcxfQ-qn6U"/>
                </div>
                <div>
                  <p className="text-body-base font-medium">Visa ending in 4242</p>
                  <p className="text-body-sm text-on-surface-variant">Expires 12/2026</p>
                </div>
                <span className="bg-secondary-container text-on-secondary-container px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ml-4">Primary</span>
              </div>
              <div className="flex items-center gap-2">
                <button className="px-3 py-1.5 text-body-sm font-medium text-on-surface hover:bg-surface-variant rounded transition-colors">Edit</button>
                <button className="w-8 h-8 flex items-center justify-center text-on-surface-variant hover:text-error transition-colors">
                  <span className="material-symbols-outlined">delete</span>
                </button>
              </div>
            </div>
          </section>
          <section className="glass-panel rounded-xl overflow-hidden border border-outline-variant mb-12">
            <div className="px-5 py-4 border-b border-outline-variant bg-surface-container-high/50">
              <h3 className="font-headline-md text-body-base font-bold">Billing History</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-label-caps text-on-surface-variant bg-surface-container-low/50">
                    <th className="px-5 py-3 font-semibold uppercase tracking-wider">Date</th>
                    <th className="px-5 py-3 font-semibold uppercase tracking-wider">Invoice ID</th>
                    <th className="px-5 py-3 font-semibold uppercase tracking-wider">Amount</th>
                    <th className="px-5 py-3 font-semibold uppercase tracking-wider">Status</th>
                    <th className="px-5 py-3 font-semibold uppercase tracking-wider text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {revenue.map((item) => (
                    <tr key={item.id} className="hover:bg-surface-variant/20 transition-colors">
                      <td className="px-5 py-4 text-body-sm">{new Date(item.date).toLocaleDateString()}</td>
                      <td className="px-5 py-4 font-data-mono text-body-sm text-primary">{item.id}</td>
                      <td className="px-5 py-4 text-body-sm">${item.amount.toFixed(2)}</td>
                      <td className="px-5 py-4">
                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-xs font-bold uppercase tracking-wider border border-emerald-500/20">Paid</span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button className="w-8 h-8 inline-flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors">
                          <span className="material-symbols-outlined text-[20px]">download</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default BillingSettings;