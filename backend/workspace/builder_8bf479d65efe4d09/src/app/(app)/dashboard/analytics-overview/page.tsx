'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

type User = {
  id: string;
  email: string;
  name: string;
  status: 'active' | 'trial' | 'churned' | 'suspended';
  createdAt: string;
};

type Order = {
  id: string;
  userId: string;
  amount: number;
  createdAt: string;
};

type Subscription = {
  id: string;
  userId: string;
  plan: string;
  startDate: string;
  endDate: string;
};

type ApiUsage = {
  id: string;
  endpoint: string;
  method: string;
};

const AnalyticsOverview = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [apiUsage, setApiUsage] = useState<ApiUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const usersResponse = await axios.get('/api/users');
        const ordersResponse = await axios.get('/api/orders');
        const subscriptionsResponse = await axios.get('/api/subscriptions');
        const apiUsageResponse = await axios.get('/api/api-usage');
        setUsers(usersResponse.data);
        setOrders(ordersResponse.data);
        setSubscriptions(subscriptionsResponse.data);
        setApiUsage(apiUsageResponse.data);
        setLoading(false);
      } catch (err) {
        setError('Failed to load data');
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error}</p>;

  return (
    <div className="dark:bg-surface-container-low text-on-surface-variant">
      <aside className="h-screen w-64 fixed left-0 top-0 bg-surface-container-low border-r border-outline-variant z-50">
        <div className="flex flex-col h-full py-8">
          <div className="px-6 mb-10 flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded flex items-center justify-center">
              <span className="material-symbols-outlined text-on-primary-container text-headline-md" data-icon="analytics">analytics</span>
            </div>
            <div>
              <h1 className="text-headline-md font-headline-md text-primary dark:text-primary leading-none">SaaS Analytics</h1>
              <p className="text-label-sm text-on-surface-variant mt-1">Enterprise Tier</p>
            </div>
          </div>
          <nav className="flex-1 px-4 space-y-1">
            <a className="flex items-center gap-3 px-3 py-2 text-primary dark:text-primary bg-secondary-container/20 dark:bg-secondary-container/20 font-semibold rounded-lg transition-colors duration-200" href="#">
              <span className="material-symbols-outlined" data-icon="dashboard">dashboard</span>
              Overview
            </a>
            <a className="flex items-center gap-3 px-3 py-2 text-on-surface-variant dark:text-on-surface-variant hover:bg-surface-variant dark:hover:bg-surface-variant transition-colors duration-200 rounded-lg" href="#">
              <span className="material-symbols-outlined" data-icon="group">group</span>
              Users
            </a>
            <a className="flex items-center gap-3 px-3 py-2 text-on-surface-variant dark:text-on-surface-variant hover:bg-surface-variant dark:hover:bg-surface-variant transition-colors duration-200 rounded-lg" href="#">
              <span className="material-symbols-outlined" data-icon="payments">payments</span>
              Subscriptions
            </a>
            <a className="flex items-center gap-3 px-3 py-2 text-on-surface-variant dark:text-on-surface-variant hover:bg-surface-variant dark:hover:bg-surface-variant transition-colors duration-200 rounded-lg" href="#">
              <span className="material-symbols-outlined" data-icon="payments">payments</span>
              Revenue
            </a>
            <a className="flex items-center gap-3 px-3 py-2 text-on-surface-variant dark:text-on-surface-variant hover:bg-surface-variant dark:hover:bg-surface-variant transition-colors duration-200 rounded-lg" href="#">
              <span className="material-symbols-outlined" data-icon="api">api</span>
              API
            </a>
            <a className="flex items-center gap-3 px-3 py-2 text-on-surface-variant dark:text-on-surface-variant hover:bg-surface-variant dark:hover:bg-surface-variant transition-colors duration-200 rounded-lg" href="#">
              <span className="material-symbols-outlined" data-icon="settings">settings</span>
              Settings
            </a>
          </nav>
          <div className="px-6 mt-auto">
            <div className="p-4 bg-surface-container rounded-xl border border-outline-variant">
              <p className="text-label-sm text-on-surface-variant uppercase tracking-wider mb-2">Support</p>
              <a className="flex items-center gap-2 text-body-md text-primary font-medium" href="#">
                <span className="material-symbols-outlined text-[18px]" data-icon="contact_support">contact_support</span>
                Help Center
              </a>
            </div>
          </div>
        </div>
      </aside>
      <header className="h-16 w-full fixed top-0 z-40 bg-surface dark:bg-surface border-b border-outline-variant dark:border-outline-variant">
        <div className="flex justify-between items-center px-6 ml-64 h-full">
          <div className="flex items-center flex-1 max-w-md">
            <div className="relative w-full">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" data-icon="search">search</span>
              <input className="w-full bg-surface-container-lowest border border-outline-variant rounded-full py-1.5 pl-10 pr-4 text-body-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface placeholder:text-on-surface-variant" placeholder="Search analytics..." type="text"/>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button className="w-10 h-10 flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors">
              <span className="material-symbols-outlined" data-icon="notifications">notifications</span>
            </button>
            <button className="w-10 h-10 flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors">
              <span className="material-symbols-outlined" data-icon="help">help</span>
            </button>
            <div className="h-8 w-[1px] bg-outline-variant mx-2"></div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-label-sm font-semibold text-on-surface">Alex Rivera</p>
                <p className="text-[10px] text-on-surface-variant uppercase">Admin</p>
              </div>
              <img alt="User Avatar" className="w-10 h-10 rounded-full border border-primary/20" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCxZ2zIqpGoOjj6TApi3xD-t4XqN1Igd6S6I7JX4Mt2jFbKY2u7JQ-GciMaalMbUvX0_HzH79rQ3CcEjyjnKdDSqZpn7OuVPxWcNj4Y81JP6XEiBQTO_vhCz16LY2b1X8aZoQNs9ZAju6ZLfwTQn_vz-NC-arb5WhG4tX8P_azCArU42WpwMLx5aEsFyD1HFKhOEs4nc1hrjBgOVy2lCIp3TQEvhrhIh8TTcAaw0ilB_V3NwGLuA2OOVb83EoUzLVEMLpDFs7JlA6U"/>
            </div>
          </div>
        </div>
      </header>
      <main className="ml-64 pt-16 h-screen overflow-y-auto custom-scrollbar bg-background">
        <div className="p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-surface-container border border-outline-variant p-5 rounded-lg">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <span className="material-symbols-outlined text-primary" data-icon="payments">payments</span>
                </div>
                <div className="flex items-center text-tertiary text-label-sm font-bold">
                  <span className="material-symbols-outlined text-[16px] mr-1" data-icon="trending_up">trending_up</span>
                  +12%
                </div>
              </div>
              <p className="text-on-surface-variant text-label-sm uppercase tracking-wider">MRR</p>
              <h3 className="text-headline-lg font-headline-lg text-on-surface">$124,500</h3>
            </div>
            <div className="bg-surface-container border border-outline-variant p-5 rounded-lg">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-secondary-container/20 rounded-lg">
                  <span className="material-symbols-outlined text-secondary" data-icon="group">group</span>
                </div>
                <div className="flex items-center text-tertiary text-label-sm font-bold">
                  <span className="material-symbols-outlined text-[16px] mr-1" data-icon="trending_up">trending_up</span>
                  +5%
                </div>
              </div>
              <p className="text-on-surface-variant text-label-sm uppercase tracking-wider">Active Users</p>
              <h3 className="text-headline-lg font-headline-lg text-on-surface">8,432</h3>
            </div>
            <div className="bg-surface-container border border-outline-variant p-5 rounded-lg">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-error/10 rounded-lg">
                  <span className="material-symbols-outlined text-error" data-icon="person_remove">person_remove</span>
                </div>
                <div className="flex items-center text-tertiary text-label-sm font-bold">
                  <span className="material-symbols-outlined text-[16px] mr-1" data-icon="trending_down">trending_down</span>
                  -0.8%
                </div>
              </div>
              <p className="text-on-surface-variant text-label-sm uppercase tracking-wider">Churn Rate</p>
              <h3 className="text-headline-lg font-headline-lg text-on-surface">2.4%</h3>
            </div>
            <div className="bg-surface-container border border-outline-variant p-5 rounded-lg">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <span className="material-symbols-outlined text-primary" data-icon="account_balance_wallet">account_balance_wallet</span>
                </div>
                <div className="flex items-center text-tertiary text-label-sm font-bold">
                  <span className="material-symbols-outlined text-[16px] mr-1" data-icon="trending_up">trending_up</span>
                  +2%
                </div>
              </div>
              <p className="text-on-surface-variant text-label-sm uppercase tracking-wider">ARPU</p>
              <h3 className="text-headline-lg font-headline-lg text-on-surface">$14.75</h3>
            </div>
          </div>
          <div className="bg-surface-container border border-outline-variant rounded-xl p-6">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-headline-md font-headline-md text-on-surface">MRR Growth</h2>
                <p className="text-body-md text-on-surface-variant">Cumulative monthly recurring revenue performance</p>
              </div>
              <div className="flex gap-2">
                <button className="px-4 py-1.5 rounded-lg bg-surface-variant text-label-sm text-on-surface">12 Months</button>
                <button className="px-4 py-1.5 rounded-lg hover:bg-surface-variant text-label-sm text-on-surface-variant transition-colors">6 Months</button>
              </div>
            </div>
            <div className="h-80 relative flex items-end justify-between gap-2 px-2">
              <div className="absolute inset-0 flex items-end">
                <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 1200 300">
                  <defs>
                    <linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#d0bcff" stopOpacity="0.3"></stop>
                      <stop offset="100%" stopColor="#d0bcff" stopOpacity="0"></stop>
                    </linearGradient>
                  </defs>
                  <path d="M0,280 Q100,260 200,240 T400,190 T600,160 T800,110 T1000,70 T1200,40 V300 H0 Z" fill="url(#chartGradient)"></path>
                  <path d="M0,280 Q100,260 200,240 T400,190 T600,160 T800,110 T1000,70 T1200,40" fill="none" stroke="#d0bcff" strokeWidth="3"></path>
                </svg>
              </div>
              <div className="w-full flex justify-between text-label-sm text-on-surface-variant mt-4 pt-4 border-t border-outline-variant/30">
                <span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span><span>Jul</span><span>Aug</span><span>Sep</span><span>Oct</span><span>Nov</span><span>Dec</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-surface-container border border-outline-variant rounded-xl p-6 lg:col-span-1">
              <div className="mb-6">
                <h3 className="text-headline-md font-headline-md text-on-surface">User Signups</h3>
                <p className="text-label-sm text-on-surface-variant">Monthly registration volume</p>
              </div>
              <div className="h-48 flex items-end justify-between gap-2">
                <div className="w-full bg-primary/20 rounded-t h-[40%]"></div>
                <div className="w-full bg-primary/40 rounded-t h-[60%]"></div>
                <div className="w-full bg-primary/60 rounded-t h-[55%]"></div>
                <div className="w-full bg-primary/30 rounded-t h-[75%]"></div>
                <div className="w-full bg-primary/80 rounded-t h-[85%]"></div>
                <div className="w-full bg-primary rounded-t h-[100%]"></div>
              </div>
              <div className="flex justify-between mt-4 text-[10px] text-on-surface-variant uppercase tracking-tighter">
                <span>Jul</span><span>Aug</span><span>Sep</span><span>Oct</span><span>Nov</span><span>Dec</span>
              </div>
            </div>
            <div className="bg-surface-container border border-outline-variant rounded-xl p-6 lg:col-span-1">
              <div className="mb-6">
                <h3 className="text-headline-md font-headline-md text-on-surface">Subscription Distribution</h3>
                <p className="text-label-sm text-on-surface-variant">Tier segmentation</p>
              </div>
              <div className="relative h-48 flex items-center justify-center">
                <div className="w-32 h-32 rounded-full border-[12px] border-primary-container relative">
                  <div className="absolute inset-[-12px] rounded-full border-[12px] border-primary border-r-transparent border-b-transparent rotate-45"></div>
                  <div className="absolute inset-[-12px] rounded-full border-[12px] border-secondary border-t-transparent border-l-transparent border-b-transparent -rotate-12"></div>
                </div>
                <div className="absolute flex flex-col items-center">
                  <span className="text-headline-lg font-bold">2.4k</span>
                  <span className="text-[10px] text-on-surface-variant">TOTAL</span>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-primary"></div>
                    <span className="text-body-md">Enterprise</span>
                  </div>
                  <span className="text-on-surface-variant">45%</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-secondary"></div>
                    <span className="text-body-md">Pro</span>
                  </div>
                  <span className="text-on-surface-variant">30%</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-primary-container"></div>
                    <span className="text-body-md">Free</span>
                  </div>
                  <span className="text-on-surface-variant">25%</span>
                </div>
              </div>
            </div>
            <div className="bg-surface-container border border-outline-variant rounded-xl p-6 lg:col-span-1">
              <div className="mb-6 flex justify-between items-center">
                <h3 className="text-headline-md font-headline-md text-on-surface">Recent Events</h3>
                <button className="text-primary text-label-sm font-semibold">View All</button>
              </div>
              <div className="space-y-4">
                <div className="flex gap-4 p-3 rounded-lg hover:bg-surface-variant transition-colors group">
                  <div className="w-10 h-10 rounded-full bg-tertiary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-tertiary group-hover:text-on-tertiary transition-colors">
                    <span className="material-symbols-outlined text-[20px]" data-icon="rocket_launch">rocket_launch</span>
                  </div>
                  <div>
                    <p className="text-body-md text-on-surface leading-tight">New Enterprise signup</p>
                    <p className="text-label-sm text-on-surface-variant">Stellar Corp joined</p>
                    <p className="text-[10px] text-outline mt-1 italic">2 mins ago</p>
                  </div>
                </div>
                <div className="flex gap-4 p-3 rounded-lg hover:bg-surface-variant transition-colors group">
                  <div className="w-10 h-10 rounded-full bg-secondary-container/20 flex items-center justify-center flex-shrink-0 group-hover:bg-secondary-container group-hover:text-on-secondary-container transition-colors">
                    <span className="material-symbols-outlined text-[20px]" data-icon="key">key</span>
                  </div>
                  <div>
                    <p className="text-body-md text-on-surface leading-tight">API Key rotated</p>
                    <p className="text-label-sm text-on-surface-variant">Internal security bot</p>
                    <p className="text-[10px] text-outline mt-1 italic">45 mins ago</p>
                  </div>
                </div>
                <div className="flex gap-4 p-3 rounded-lg hover:bg-surface-variant transition-colors group">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary group-hover:text-on-primary transition-colors">
                    <span className="material-symbols-outlined text-[20px]" data-icon="upgrade">upgrade</span>
                  </div>
                  <div>
                    <p className="text-body-md text-on-surface leading-tight">Subscription upgraded</p>
                    <p className="text-label-sm text-on-surface-variant">User #4921 (Free → Pro)</p>
                    <p className="text-[10px] text-outline mt-1 italic">2 hours ago</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      <button className="fixed bottom-8 right-8 w-14 h-14 bg-primary text-on-primary rounded-full shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-all z-50">
        <span className="material-symbols-outlined text-[28px]" data-icon="add" data-weight="fill">add</span>
      </button>
    </div>
  );
};

export default AnalyticsOverview;