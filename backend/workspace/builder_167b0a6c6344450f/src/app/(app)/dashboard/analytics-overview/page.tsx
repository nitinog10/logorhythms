'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';

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

const AnalyticsOverview = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [apiUsage, setApiUsage] = useState<APIUsage[]>([]);
  const [revenue, setRevenue] = useState<Revenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const usersResponse = await axios.get('/api/users');
        const subscriptionsResponse = await axios.get('/api/subscriptions');
        const apiUsageResponse = await axios.get('/api/api-usage');
        const revenueResponse = await axios.get('/api/revenue');

        setUsers(usersResponse.data);
        setSubscriptions(subscriptionsResponse.data);
        setApiUsage(apiUsageResponse.data);
        setRevenue(revenueResponse.data);
        setLoading(false);
      } catch (err) {
        setError('Failed to fetch data');
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div className="bg-background text-on-surface font-body-base">
      <aside className="bg-surface-container-low dark:bg-surface-container-low h-screen w-64 flex-col fixed left-0 top-0 border-r border-outline-variant/30 flex flex-col p-gutter z-50">
        <div className="mb-10 flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-container rounded-lg flex items-center justify-center">
            <span className="material-symbols-outlined text-on-primary-container" style={{ fontVariationSettings: "'FILL' 1" }}>analytics</span>
          </div>
          <div>
            <h1 className="font-headline-md text-headline-md font-bold text-on-surface dark:text-on-surface">Quantix</h1>
            <p className="text-xs text-on-surface-variant uppercase tracking-widest">Enterprise Analytics</p>
          </div>
        </div>
        <nav className="flex-1 flex flex-col gap-1">
          <a className="flex items-center gap-3 px-4 py-3 bg-secondary-container text-on-secondary-container rounded-lg font-body-base text-body-base transition-all duration-200 ease-in-out" href="#">
            <span className="material-symbols-outlined" data-icon="dashboard">dashboard</span>
            <span>Overview</span>
          </a>
          <a className="flex items-center gap-3 px-4 py-3 text-on-surface-variant hover:text-on-surface transition-colors font-body-base text-body-base hover:bg-surface-container-highest/50 rounded-lg" href="#">
            <span className="material-symbols-outlined" data-icon="group">group</span>
            <span>Users</span>
          </a>
          <a className="flex items-center gap-3 px-4 py-3 text-on-surface-variant hover:text-on-surface transition-colors font-body-base text-body-base hover:bg-surface-container-highest/50 rounded-lg" href="#">
            <span className="material-symbols-outlined" data-icon="subscriptions">subscriptions</span>
            <span>Subscriptions</span>
          </a>
          <a className="flex items-center gap-3 px-4 py-3 text-on-surface-variant hover:text-on-surface transition-colors font-body-base text-body-base hover:bg-surface-container-highest/50 rounded-lg" href="#">
            <span className="material-symbols-outlined" data-icon="payments">payments</span>
            <span>Revenue</span>
          </a>
          <a className="flex items-center gap-3 px-4 py-3 text-on-surface-variant hover:text-on-surface transition-colors font-body-base text-body-base hover:bg-surface-container-highest/50 rounded-lg" href="#">
            <span className="material-symbols-outlined" data-icon="api">api</span>
            <span>API</span>
          </a>
          <div className="mt-auto pt-4 border-t border-outline-variant/20">
            <a className="flex items-center gap-3 px-4 py-3 text-on-surface-variant hover:text-on-surface transition-colors font-body-base text-body-base hover:bg-surface-container-highest/50 rounded-lg" href="#">
              <span className="material-symbols-outlined" data-icon="settings">settings</span>
              <span>Settings</span>
            </a>
          </div>
        </nav>
      </aside>
      <header className="h-16 w-full fixed top-0 z-40 bg-surface/70 backdrop-blur-xl border-b border-outline-variant/20 flex justify-between items-center px-container-padding ml-64 max-w-[calc(100%-16rem)]">
        <div className="flex items-center bg-surface-container-low px-4 py-1.5 rounded-full border border-outline-variant/20 w-96">
          <span className="material-symbols-outlined text-on-surface-variant mr-2">search</span>
          <input className="bg-transparent border-none focus:ring-0 text-body-sm text-on-surface w-full p-0" placeholder="Search analytics..." type="text"/>
        </div>
        <div className="flex items-center gap-6">
          <button className="text-on-surface-variant hover:text-primary transition-transform scale-95 active:scale-90 relative">
            <span className="material-symbols-outlined" data-icon="notifications">notifications</span>
            <span className="absolute top-0 right-0 w-2 h-2 bg-primary rounded-full"></span>
          </button>
          <button className="text-on-surface-variant hover:text-primary transition-transform scale-95 active:scale-90">
            <span className="material-symbols-outlined" data-icon="help_outline">help_outline</span>
          </button>
          <div className="h-8 w-[1px] bg-outline-variant/30"></div>
          <div className="flex items-center gap-3 cursor-pointer group">
            <div className="text-right">
              <p className="text-body-sm font-bold text-on-surface group-hover:text-primary transition-colors">Alex Rivers</p>
              <p className="text-[10px] text-on-surface-variant uppercase tracking-tighter">Admin Access</p>
            </div>
            <img alt="User Profile" className="w-10 h-10 rounded-full border border-primary/30" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCVQjtIQTGJ-SAJfSAA_RlC3Cr4HGbo7oGaf3-hvWHaEB35ccFepxIdHWwqJORwJWeREyrKgnNOZVHPcyOjWk_KhZDVZg-2zNjzkdn1O8pzHtMrISjW_r1h1fvte7rTNQBb-oi7OBDtvep9Xb4KM0JlRi8gSB02lKAR9zhVtKHt-cjKKJeQmknM26G3zTyUZ0AZ8zxPJ6zGcDeV-cPmq4Z-yZmC6jTv5ti-_azcoOTNGLxrjtVOZPMVXuATVicaKxWQNVsA1KM9acM"/>
          </div>
        </div>
      </header>
      <main className="ml-64 pt-24 px-container-padding pb-gutter">
        <div className="grid grid-cols-12 gap-gutter">
          <div className="col-span-12 lg:col-span-3 glass-card rounded-xl p-widget-padding">
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-primary/10 rounded-lg text-primary">
                <span className="material-symbols-outlined">payments</span>
              </div>
              <span className="flex items-center text-xs font-bold text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-full">
                <span className="material-symbols-outlined text-sm mr-1">trending_up</span> 12.5%
              </span>
            </div>
            <p className="text-on-surface-variant font-label-caps uppercase">MRR</p>
            <h2 className="text-display-lg font-display-lg text-on-surface">$248,500</h2>
          </div>
          <div className="col-span-12 lg:col-span-3 glass-card rounded-xl p-widget-padding">
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-primary/10 rounded-lg text-primary">
                <span className="material-symbols-outlined">person_add</span>
              </div>
              <span className="flex items-center text-xs font-bold text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-full">
                <span className="material-symbols-outlined text-sm mr-1">trending_up</span> 8.2%
              </span>
            </div>
            <p className="text-on-surface-variant font-label-caps uppercase">Active Users</p>
            <h2 className="text-display-lg font-display-lg text-on-surface">14.2k</h2>
          </div>
          <div className="col-span-12 lg:col-span-3 glass-card rounded-xl p-widget-padding">
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-primary/10 rounded-lg text-primary">
                <span className="material-symbols-outlined">analytics</span>
              </div>
              <span className="flex items-center text-xs font-bold text-rose-400 bg-rose-400/10 px-2 py-1 rounded-full">
                <span className="material-symbols-outlined text-sm mr-1">trending_down</span> 1.4%
              </span>
            </div>
            <p className="text-on-surface-variant font-label-caps uppercase">Churn Rate</p>
            <h2 className="text-display-lg font-display-lg text-on-surface">2.4%</h2>
          </div>
          <div className="col-span-12 lg:col-span-3 glass-card rounded-xl p-widget-padding">
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-primary/10 rounded-lg text-primary">
                <span className="material-symbols-outlined">savings</span>
              </div>
              <span className="flex items-center text-xs font-bold text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-full">
                <span className="material-symbols-outlined text-sm mr-1">trending_up</span> 4.1%
              </span>
            </div>
            <p className="text-on-surface-variant font-label-caps uppercase">ARPU</p>
            <h2 className="text-display-lg font-display-lg text-on-surface">$17.50</h2>
          </div>
          <div className="col-span-12 lg:col-span-9 glass-card rounded-xl p-widget-padding relative overflow-hidden h-[400px]">
            <div className="flex justify-between items-center mb-8 relative z-10">
              <div>
                <h3 className="text-headline-md font-headline-md text-on-surface">MRR Growth</h3>
                <p className="text-body-sm text-on-surface-variant">Last 12 months performance trends</p>
              </div>
              <div className="flex gap-2">
                <button className="px-4 py-1.5 rounded-lg border border-outline-variant/30 text-body-sm text-on-surface-variant hover:bg-surface-container-highest transition-colors">Download Report</button>
              </div>
            </div>
            <div className="absolute inset-0 top-32 px-10 pb-10 chart-grid">
              <svg className="w-full h-full drop-shadow-[0_0_8px_rgba(208,188,255,0.4)]" viewBox="0 0 1000 200">
                <defs>
                  <linearGradient id="purpleGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#d0bcff" stopOpacity="0.3"></stop>
                    <stop offset="100%" stopColor="#d0bcff" stopOpacity="0"></stop>
                  </linearGradient>
                </defs>
                <path d="M0,150 Q100,120 200,130 T400,80 T600,100 T800,40 T1000,60 L1000,200 L0,200 Z" fill="url(#purpleGradient)"></path>
                <path d="M0,150 Q100,120 200,130 T400,80 T600,100 T800,40 T1000,60" fill="none" stroke="#d0bcff" strokeWidth="3"></path>
                <circle cx="200" cy="130" fill="#d0bcff" r="4"></circle>
                <circle cx="400" cy="80" fill="#d0bcff" r="4"></circle>
                <circle cx="600" cy="100" fill="#d0bcff" r="4"></circle>
                <circle cx="800" cy="40" fill="#d0bcff" r="4"></circle>
              </svg>
              <div className="flex justify-between mt-4 text-[10px] font-data-mono text-on-surface-variant/60 uppercase tracking-widest">
                <span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span><span>Jul</span><span>Aug</span><span>Sep</span><span>Oct</span><span>Nov</span><span>Dec</span>
              </div>
            </div>
          </div>
          <div className="col-span-12 lg:col-span-3 glass-card rounded-xl p-widget-padding overflow-hidden">
            <h3 className="text-body-base font-bold text-on-surface mb-6">Recent Events</h3>
            <div className="space-y-6">
              <div className="flex gap-4 group">
                <div className="relative">
                  <div className="w-2 h-2 bg-primary rounded-full mt-2 ring-4 ring-primary/10"></div>
                  <div className="absolute top-6 bottom-[-24px] left-1 w-[1px] bg-outline-variant/30"></div>
                </div>
                <div>
                  <p className="text-body-sm font-bold text-on-surface group-hover:text-primary transition-colors">New subscription</p>
                  <p className="text-[12px] text-on-surface-variant">Loom Inc. upgraded to Pro Plan</p>
                  <p className="text-[10px] font-data-mono text-outline mt-1">2 mins ago</p>
                </div>
              </div>
              <div className="flex gap-4 group">
                <div className="relative">
                  <div className="w-2 h-2 bg-primary rounded-full mt-2 ring-4 ring-primary/10"></div>
                  <div className="absolute top-6 bottom-[-24px] left-1 w-[1px] bg-outline-variant/30"></div>
                </div>
                <div>
                  <p className="text-body-sm font-bold text-on-surface group-hover:text-primary transition-colors">API key generated</p>
                  <p className="text-[12px] text-on-surface-variant">Developer console: Production Key #4</p>
                  <p className="text-[10px] font-data-mono text-outline mt-1">14 mins ago</p>
                </div>
              </div>
              <div className="flex gap-4 group">
                <div className="relative">
                  <div className="w-2 h-2 bg-amber-400 rounded-full mt-2 ring-4 ring-amber-400/10"></div>
                  <div className="absolute top-6 bottom-[-24px] left-1 w-[1px] bg-outline-variant/30"></div>
                </div>
                <div>
                  <p className="text-body-sm font-bold text-on-surface group-hover:text-primary transition-colors">Failed login attempt</p>
                  <p className="text-[12px] text-on-surface-variant">IP: 192.168.1.104 (Singapore)</p>
                  <p className="text-[10px] font-data-mono text-outline mt-1">45 mins ago</p>
                </div>
              </div>
              <div className="flex gap-4 group">
                <div className="relative">
                  <div className="w-2 h-2 bg-primary rounded-full mt-2 ring-4 ring-primary/10"></div>
                </div>
                <div>
                  <p className="text-body-sm font-bold text-on-surface group-hover:text-primary transition-colors">Refund processed</p>
                  <p className="text-[12px] text-on-surface-variant">Transaction ID: #PX-9921</p>
                  <p className="text-[10px] font-data-mono text-outline mt-1">1 hr ago</p>
                </div>
              </div>
            </div>
            <button className="w-full mt-8 py-2 text-body-sm text-primary font-bold hover:bg-primary/5 rounded-lg transition-colors border border-primary/20">View All Activity</button>
          </div>
          <div className="col-span-12 lg:col-span-8 glass-card rounded-xl p-widget-padding">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-body-base font-bold text-on-surface">User Signups</h3>
              <select className="bg-surface-container-low border border-outline-variant/30 rounded-lg text-xs py-1 px-3 focus:ring-primary focus:border-primary">
                <option>Last 7 days</option>
                <option>Last 30 days</option>
              </select>
            </div>
            <div className="flex items-end justify-between h-48 px-4">
              <div className="w-8 bg-primary/20 rounded-t-sm h-1/4 hover:bg-primary/40 transition-colors group relative">
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-surface-container-highest px-2 py-1 rounded text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">12</div>
              </div>
              <div className="w-8 bg-primary/20 rounded-t-sm h-2/5 hover:bg-primary/40 transition-colors group relative">
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-surface-container-highest px-2 py-1 rounded text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">24</div>
              </div>
              <div className="w-8 bg-primary/20 rounded-t-sm h-1/2 hover:bg-primary/40 transition-colors group relative">
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-surface-container-highest px-2 py-1 rounded text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">36</div>
              </div>
              <div className="w-8 bg-primary/60 rounded-t-sm h-3/4 hover:bg-primary/80 transition-colors group relative">
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-surface-container-highest px-2 py-1 rounded text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">58</div>
              </div>
              <div className="w-8 bg-primary/20 rounded-t-sm h-2/3 hover:bg-primary/40 transition-colors group relative">
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-surface-container-highest px-2 py-1 rounded text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">42</div>
              </div>
              <div className="w-8 bg-primary/20 rounded-t-sm h-1/3 hover:bg-primary/40 transition-colors group relative">
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-surface-container-highest px-2 py-1 rounded text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">18</div>
              </div>
              <div className="w-8 bg-primary/20 rounded-t-sm h-1/2 hover:bg-primary/40 transition-colors group relative">
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-surface-container-highest px-2 py-1 rounded text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">31</div>
              </div>
            </div>
            <div className="flex justify-between mt-4 text-[10px] text-on-surface-variant font-data-mono uppercase tracking-widest px-4">
              <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
            </div>
          </div>
          <div className="col-span-12 lg:col-span-4 glass-card rounded-xl p-widget-padding flex flex-col items-center">
            <div className="w-full flex justify-between items-center mb-6">
              <h3 className="text-body-base font-bold text-on-surface">Subscription Distribution</h3>
              <span className="material-symbols-outlined text-on-surface-variant">info</span>
            </div>
            <div className="relative w-48 h-48 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" fill="none" r="15.915" stroke="#273647" strokeWidth="4"></circle>
                <circle cx="18" cy="18" fill="none" r="15.915" stroke="#d0bcff" strokeDasharray="60 40" strokeWidth="4"></circle>
                <circle cx="18" cy="18" fill="none" r="15.915" stroke="#4f319c" strokeDasharray="25 75" strokeDashoffset="-60" strokeWidth="4"></circle>
              </svg>
              <div className="absolute flex flex-col items-center">
                <p className="text-display-lg font-bold text-on-surface leading-none">85%</p>
                <p className="text-[10px] text-on-surface-variant uppercase tracking-widest">Active</p>
              </div>
            </div>
            <div className="w-full mt-8 grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-primary"></div>
                <p className="text-body-sm text-on-surface-variant">Enterprise (60%)</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-secondary-container"></div>
                <p className="text-body-sm text-on-surface-variant">Pro (25%)</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-surface-container-highest"></div>
                <p className="text-body-sm text-on-surface-variant">Free (15%)</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AnalyticsOverview;