'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

type User = {
  id: string;
  email: string;
  name: string;
  status: 'active' | 'trial' | 'churned' | 'suspended';
  createdAt: Date;
};

type Order = {
  id: string;
  userId: string;
  amount: number;
  createdAt: Date;
};

type Subscription = {
  id: string;
  userId: string;
  plan: string;
  startDate: Date;
  endDate: Date;
};

type ApiUsage = {
  id: string;
  endpoint: string;
  method: string;
};

const BillingSettings = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [apiUsage, setApiUsage] = useState<ApiUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [usersRes, ordersRes, subscriptionsRes, apiUsageRes] = await Promise.all([
          axios.get('/api/users'),
          axios.get('/api/orders'),
          axios.get('/api/subscriptions'),
          axios.get('/api/api-usage'),
        ]);
        setUsers(usersRes.data);
        setOrders(ordersRes.data);
        setSubscriptions(subscriptionsRes.data);
        setApiUsage(apiUsageRes.data);
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
    <div className="dark bg-surface text-on-surface overflow-x-hidden">
      <aside className="fixed left-0 top-0 h-screen w-64 flex flex-col py-6 z-50 bg-surface-container border-r border-outline-variant">
        <div className="px-6 mb-8 flex items-center gap-3">
          <div className="w-10 h-10 rounded bg-primary-container flex items-center justify-center">
            <span className="material-symbols-outlined text-on-primary-container">dashboard</span>
          </div>
          <div>
            <h1 className="font-headline-md text-headline-md font-bold text-primary">Obsidian</h1>
            <p className="font-label-sm text-label-sm text-on-surface-variant">Analytics Dashboard</p>
          </div>
        </div>
        <nav className="flex-1 flex flex-col gap-1">
          <a className="text-on-surface-variant flex items-center gap-stack-sm px-6 py-3 hover:text-primary hover:bg-surface-container-highest/50 transition-all" href="#">
            <span className="material-symbols-outlined">dashboard</span>
            <span>Overview</span>
          </a>
          <a className="text-on-surface-variant flex items-center gap-stack-sm px-6 py-3 hover:text-primary hover:bg-surface-container-highest/50 transition-all" href="#">
            <span className="material-symbols-outlined">group</span>
            <span>Users</span>
          </a>
          <a className="text-on-surface-variant flex items-center gap-stack-sm px-6 py-3 hover:text-primary hover:bg-surface-container-highest/50 transition-all" href="#">
            <span className="material-symbols-outlined">payments</span>
            <span>Revenue</span>
          </a>
          <a className="text-primary font-bold border-r-2 border-primary bg-primary-container/10 flex items-center gap-stack-sm px-6 py-3 transition-all" href="#">
            <span className="material-symbols-outlined">receipt_long</span>
            <span>Billing</span>
          </a>
        </nav>
        <div className="px-4 mb-6">
          <button className="w-full py-3 px-4 bg-primary text-on-primary rounded font-bold hover:opacity-90 transition-colors">
            Upgrade Plan
          </button>
        </div>
        <div className="mt-auto flex flex-col gap-1">
          <a className="text-on-surface-variant flex items-center gap-stack-sm px-6 py-3 hover:text-primary transition-all" href="#">
            <span className="material-symbols-outlined">settings</span>
            <span>Settings</span>
          </a>
          <a className="text-on-surface-variant flex items-center gap-stack-sm px-6 py-3 hover:text-primary transition-all" href="#">
            <span className="material-symbols-outlined">contact_support</span>
            <span>Support</span>
          </a>
        </div>
      </aside>
      <main className="ml-64 min-h-screen flex flex-col">
        <header className="flex justify-between items-center w-full px-gutter h-16 z-40 sticky top-0 bg-surface-dim border-b border-outline-variant">
          <div className="flex items-center gap-4">
            <h2 className="font-headline-md text-headline-md font-bold text-primary">Billing & Subscriptions</h2>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex gap-4">
              <button className="text-on-surface-variant hover:bg-surface-container-highest p-2 rounded-full transition-colors">
                <span className="material-symbols-outlined">notifications</span>
              </button>
              <button className="text-on-surface-variant hover:bg-surface-container-highest p-2 rounded-full transition-colors">
                <span className="material-symbols-outlined">help</span>
              </button>
            </div>
            <div className="flex items-center gap-3 pl-4 border-l border-outline-variant">
              <img alt="User Profile" className="w-8 h-8 rounded-full border border-primary/20" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCiqcJ2ydQqePbrqNhsRf9yDYDHfYuHXG4-P3Mc1eYU4THVGoif6X74PSA0yNPvNtqa6ytJVynxNSeFMyT1ivKj7Q706DsGoUACL2r0-oUDdRjuhwtX_c0LnUmtettRq4ypwA6lF2By9HqSLtimnsuiuF6T7zJOobocRO6QeTgObi7rHcaEOYzsFIrOi6ydozsBlK3fOXljyVZZUL-q3VF4-eMNZgy3TdAPwoZ2H0I9whZbk4G-_gzg910rcZ1D1rQrt2bQwyP2RqQ"/>
            </div>
          </div>
        </header>
        <div className="p-container-padding flex flex-col gap-gutter">
          <div className="grid grid-cols-12 gap-gutter">
            <div className="col-span-12 lg:col-span-8 bg-surface-container card-border rounded-xl p-6">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h3 className="font-headline-md text-headline-md text-on-surface mb-1">Current Plan Usage</h3>
                  <p className="text-on-surface-variant text-body-md">Manage your current Pro Plan resource consumption.</p>
                </div>
                <span className="px-3 py-1 bg-primary-container text-on-primary-container rounded-full font-label-sm text-label-sm">PRO PLAN ACTIVE</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">API Calls</span>
                    <span className="font-bold text-primary">45%</span>
                  </div>
                  <div className="h-2 w-full bg-surface-container-highest rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: '45%' }}></div>
                  </div>
                  <p className="text-body-md text-on-surface-variant">45,000 / 100,000</p>
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Storage</span>
                    <span className="font-bold text-primary">24%</span>
                  </div>
                  <div className="h-2 w-full bg-surface-container-highest rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: '24%' }}></div>
                  </div>
                  <p className="text-body-md text-on-surface-variant">1.2 GB / 5 GB</p>
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Team</span>
                    <span className="font-bold text-primary">80%</span>
                  </div>
                  <div className="h-2 w-full bg-surface-container-highest rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: '80%' }}></div>
                  </div>
                  <p className="text-body-md text-on-surface-variant">8 / 10 Members</p>
                </div>
              </div>
            </div>
            <div className="col-span-12 lg:col-span-4 bg-surface-container card-border rounded-xl p-6 flex flex-col justify-between">
              <div className="mb-4">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="font-headline-md text-headline-md text-on-surface">Payment Method</h3>
                  <button className="text-primary font-label-sm hover:underline">Edit</button>
                </div>
                <div className="bg-gradient-to-br from-surface-container-highest to-surface-dim p-6 rounded-xl border border-outline-variant relative overflow-hidden group">
                  <div className="absolute -right-4 -top-4 w-24 h-24 bg-primary/10 rounded-full blur-2xl group-hover:bg-primary/20 transition-all"></div>
                  <div className="flex justify-between items-start mb-10">
                    <span className="material-symbols-outlined text-4xl text-on-surface-variant">credit_card</span>
                    <span className="font-bold text-on-surface">VISA</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-body-md text-on-surface-variant tracking-[0.2em]">•••• •••• •••• 4242</p>
                    <div className="flex justify-between items-end mt-4">
                      <p className="text-label-sm text-on-surface-variant uppercase">Exp 12/26</p>
                      <div className="flex gap-2">
                        <div className="w-6 h-6 rounded-full bg-on-secondary/30"></div>
                        <div className="w-6 h-6 rounded-full bg-on-tertiary/30 -ml-4"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-label-sm text-on-surface-variant">Next billing date: Oct 24, 2023</p>
            </div>
          </div>
          <section>
            <div className="flex flex-col gap-2 mb-8">
              <h3 className="font-headline-lg text-headline-lg text-on-surface">Available Plans</h3>
              <p className="text-on-surface-variant text-body-lg">Select the tier that fits your organization's analytical needs.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
              <div className="bg-surface-container card-border rounded-xl p-8 flex flex-col hover:border-outline transition-colors group">
                <div className="mb-8">
                  <p className="text-primary font-bold uppercase tracking-widest text-label-sm mb-2">Basic</p>
                  <h4 className="text-headline-xl font-bold text-on-surface">$0<span className="text-body-md font-normal text-on-surface-variant">/mo</span></h4>
                </div>
                <ul className="flex-1 space-y-4 mb-8">
                  <li className="flex items-center gap-3 text-on-surface-variant">
                    <span className="material-symbols-outlined text-primary text-body-lg">check_circle</span>
                    Basic analytics
                  </li>
                  <li className="flex items-center gap-3 text-on-surface-variant">
                    <span className="material-symbols-outlined text-primary text-body-lg">check_circle</span>
                    1 user seat
                  </li>
                  <li className="flex items-center gap-3 text-on-surface-variant opacity-40">
                    <span className="material-symbols-outlined text-body-lg">cancel</span>
                    Advanced features
                  </li>
                </ul>
                <button className="w-full py-4 border border-outline-variant text-on-surface rounded font-bold hover:bg-surface-container-highest transition-colors">
                  Current Plan
                </button>
              </div>
              <div className="bg-surface-container-high card-border rounded-xl p-8 flex flex-col border-primary relative shadow-2xl">
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-on-primary px-4 py-1 rounded-full text-label-sm font-bold uppercase tracking-widest">
                  Most Popular
                </div>
                <div className="mb-8">
                  <p className="text-primary-container font-bold uppercase tracking-widest text-label-sm mb-2">Pro</p>
                  <h4 className="text-headline-xl font-bold text-on-surface">$49<span className="text-body-md font-normal text-on-surface-variant">/mo</span></h4>
                </div>
                <ul className="flex-1 space-y-4 mb-8">
                  <li className="flex items-center gap-3 text-on-surface">
                    <span className="material-symbols-outlined text-primary text-body-lg">check_circle</span>
                    Advanced features
                  </li>
                  <li className="flex items-center gap-3 text-on-surface">
                    <span className="material-symbols-outlined text-primary text-body-lg">check_circle</span>
                    10 users included
                  </li>
                  <li className="flex items-center gap-3 text-on-surface">
                    <span className="material-symbols-outlined text-primary text-body-lg">check_circle</span>
                    Priority email support
                  </li>
                  <li className="flex items-center gap-3 text-on-surface">
                    <span className="material-symbols-outlined text-primary text-body-lg">check_circle</span>
                    Custom dashboards
                  </li>
                </ul>
                <button className="w-full py-4 bg-primary text-on-primary rounded font-bold hover:opacity-90 transition-opacity">
                  Manage Subscription
                </button>
              </div>
              <div className="bg-surface-container card-border rounded-xl p-8 flex flex-col hover:border-outline transition-colors group">
                <div className="mb-8">
                  <p className="text-primary font-bold uppercase tracking-widest text-label-sm mb-2">Enterprise</p>
                  <h4 className="text-headline-xl font-bold text-on-surface">$499<span className="text-body-md font-normal text-on-surface-variant">/mo</span></h4>
                </div>
                <ul className="flex-1 space-y-4 mb-8">
                  <li className="flex items-center gap-3 text-on-surface-variant">
                    <span className="material-symbols-outlined text-primary text-body-lg">check_circle</span>
                    Custom resource limits
                  </li>
                  <li className="flex items-center gap-3 text-on-surface-variant">
                    <span className="material-symbols-outlined text-primary text-body-lg">check_circle</span>
                    Single Sign-On (SSO)
                  </li>
                  <li className="flex items-center gap-3 text-on-surface-variant">
                    <span className="material-symbols-outlined text-primary text-body-lg">check_circle</span>
                    Dedicated account manager
                  </li>
                  <li className="flex items-center gap-3 text-on-surface-variant">
                    <span className="material-symbols-outlined text-primary text-body-lg">check_circle</span>
                    24/7 Phone support
                  </li>
                </ul>
                <button className="w-full py-4 border border-primary text-primary rounded font-bold hover:bg-primary/10 transition-colors">
                  Contact Sales
                </button>
              </div>
            </div>
          </section>
          <section className="bg-surface-container card-border rounded-xl overflow-hidden mb-12">
            <div className="px-8 py-6 border-b border-outline-variant">
              <h3 className="font-headline-md text-headline-md text-on-surface">Billing History</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-surface-container-highest/30">
                  <tr>
                    <th className="px-8 py-4 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest">Date</th>
                    <th className="px-8 py-4 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest">Invoice ID</th>
                    <th className="px-8 py-4 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest">Amount</th>
                    <th className="px-8 py-4 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest text-center">Status</th>
                    <th className="px-8 py-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {orders.map((order) => (
                    <tr key={order.id} className="hover:bg-surface-container-highest/20 transition-colors">
                      <td className="px-8 py-6 text-on-surface">{order.createdAt.toLocaleDateString()}</td>
                      <td className="px-8 py-6 text-on-surface-variant font-mono">{order.id}</td>
                      <td className="px-8 py-6 text-on-surface">${order.amount.toFixed(2)}</td>
                      <td className="px-8 py-6 text-center">
                        <span className="px-3 py-1 bg-on-primary-container/20 text-on-primary-container rounded-full text-label-sm font-bold">PAID</span>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <button className="text-primary hover:underline">Download</button>
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