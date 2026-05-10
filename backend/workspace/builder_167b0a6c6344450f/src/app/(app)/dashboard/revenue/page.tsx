"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";

type User = {
  id: string;
  email: string;
  name: string;
  status: "active" | "trial" | "churned" | "suspended";
  createdAt: Date;
};

type Subscription = {
  id: string;
  userId: string;
  plan: "starter" | "pro" | "enterprise";
  billingCycle: "monthly" | "yearly";
  createdAt: Date;
};

type Revenue = {
  totalMRR: number;
  netNewMRR: number;
  expansionMRR: number;
  churnedMRR: number;
};

const RevenueDashboard = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [revenue, setRevenue] = useState<Revenue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const usersResponse = await axios.get("/api/users");
        const subscriptionsResponse = await axios.get("/api/subscriptions");
        const revenueResponse = await axios.get("/api/revenue");

        setUsers(usersResponse.data);
        setSubscriptions(subscriptionsResponse.data);
        setRevenue(revenueResponse.data);
        setLoading(false);
      } catch (err) {
        setError("Failed to fetch data");
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="bg-background text-on-surface flex h-screen overflow-hidden">
      <aside className="hidden md:flex flex-col h-screen left-0 w-64 bg-surface-container border-r border-outline-variant/30 z-50">
        <div className="flex flex-col h-full p-gutter gap-8">
          <div className="flex items-center gap-3 px-2">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-on-primary font-bold text-headline-md">Q</div>
            <div>
              <h2 className="font-headline-md text-headline-md font-bold text-on-surface leading-tight">Quantix</h2>
              <p className="font-body-sm text-body-sm text-outline">Revenue Ops</p>
            </div>
          </div>
          <nav className="flex flex-col gap-2 flex-grow">
            <a className="flex items-center gap-3 bg-secondary-container text-on-secondary-container rounded-lg px-3 py-2 font-semibold active:scale-[0.98] transition-transform duration-150" href="#">
              <span className="material-symbols-outlined">dashboard</span>
              <span className="font-body-sm text-body-sm">Dashboard</span>
            </a>
            <a className="flex items-center gap-3 text-on-surface-variant hover:bg-surface-variant/50 rounded-lg px-3 py-2 transition-all active:scale-[0.98]" href="#">
              <span className="material-symbols-outlined">payments</span>
              <span className="font-body-sm text-body-sm">Revenue</span>
            </a>
            <a className="flex items-center gap-3 text-on-surface-variant hover:bg-surface-variant/50 rounded-lg px-3 py-2 transition-all active:scale-[0.98]" href="#">
              <span className="material-symbols-outlined">group</span>
              <span className="font-body-sm text-body-sm">Customers</span>
            </a>
            <a className="flex items-center gap-3 text-on-surface-variant hover:bg-surface-variant/50 rounded-lg px-3 py-2 transition-all active:scale-[0.98]" href="#">
              <span className="material-symbols-outlined">query_stats</span>
              <span className="font-body-sm text-body-sm">Forecast</span>
            </a>
            <a className="flex items-center gap-3 text-on-surface-variant hover:bg-surface-variant/50 rounded-lg px-3 py-2 transition-all active:scale-[0.98]" href="#">
              <span className="material-symbols-outlined">description</span>
              <span className="font-body-sm text-body-sm">Reports</span>
            </a>
          </nav>
          <div className="flex flex-col gap-2 border-t border-outline-variant/30 pt-4">
            <div className="mb-4">
              <div className="bg-primary/10 border border-primary/20 rounded-xl p-4">
                <p className="font-label-caps text-label-caps text-primary mb-1">PRO PLAN</p>
                <p className="font-body-sm text-body-sm text-on-surface mb-3">Enterprise analytics unlocked.</p>
                <button className="w-full bg-primary text-on-primary py-2 rounded-lg font-body-sm font-bold active:scale-95 transition-transform">Upgrade Plan</button>
              </div>
            </div>
            <a className="flex items-center gap-3 text-on-surface-variant hover:bg-surface-variant/50 rounded-lg px-3 py-2 transition-all" href="#">
              <span className="material-symbols-outlined">help</span>
              <span className="font-body-sm text-body-sm">Help Center</span>
            </a>
            <a className="flex items-center gap-3 text-on-surface-variant hover:bg-surface-variant/50 rounded-lg px-3 py-2 transition-all" href="#">
              <span className="material-symbols-outlined">logout</span>
              <span className="font-body-sm text-body-sm">Log Out</span>
            </a>
          </div>
        </div>
      </aside>
      <div className="flex-grow flex flex-col h-screen overflow-hidden bg-surface">
        <header className="sticky top-0 z-40 h-16 bg-surface/70 backdrop-blur-xl border-b border-outline-variant/30 flex justify-between items-center w-full px-container-padding shadow-sm">
          <div className="flex items-center gap-6">
            <h1 className="font-headline-md text-headline-md font-bold text-primary">RevAnalytix</h1>
            <div className="hidden lg:flex items-center gap-6">
              <a className="text-primary font-bold border-b-2 border-primary pb-1 font-body-base text-body-base" href="#">Overview</a>
              <a className="text-on-surface-variant font-medium hover:text-primary transition-colors duration-200 font-body-base text-body-base" href="#">Marketplace</a>
              <a className="text-on-surface-variant font-medium hover:text-primary transition-colors duration-200 font-body-base text-body-base" href="#">Audits</a>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative hidden sm:block">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline scale-90">search</span>
              <input className="bg-surface-container-low border border-outline-variant/30 rounded-full pl-10 pr-4 py-1.5 text-body-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary w-64 transition-all" placeholder="Search analytics..." type="text"/>
            </div>
            <button className="material-symbols-outlined text-on-surface-variant hover:text-primary cursor-pointer active:scale-95 transition-all">notifications</button>
            <button className="material-symbols-outlined text-on-surface-variant hover:text-primary cursor-pointer active:scale-95 transition-all">settings</button>
            <img alt="User avatar" className="w-8 h-8 rounded-full border border-primary/30" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDH7NWQwpz8q1Zo2b2zVd4x8zP8NdLW2dofCxMlf_-GhBKBZLzPXIg_svjlw6ZfZXd-_K48HatU6IrJvskokwNlg3fvWfe8PP_KVFY1npshUVKbPJAXn5001Q9M3dcixKINQXzLUSm6iMoSc01m7E01StqlnCsJwNv7AD_anR2u8YhZ-8xDeVMMrDhfeegKOGtct-PoTYZyPcqGpD3VSMltrJlii2Wg_DryfZHxefFNv3jbORmza5ZkIj_qdPdG8EherX8XRp6cekE"/>
          </div>
        </header>
        <main className="flex-grow overflow-y-auto p-container-padding space-y-section-gap">
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter">
            <div className="glass-card p-widget-padding rounded-xl relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-1 h-full bg-primary opacity-50"></div>
              <div className="flex justify-between items-start mb-4">
                <p className="font-label-caps text-label-caps text-outline">Total MRR</p>
                <span className="material-symbols-outlined text-primary">account_balance_wallet</span>
              </div>
              <h3 className="font-display-lg text-3xl font-bold text-on-surface mb-2 tracking-tight">${revenue?.totalMRR.toLocaleString()}</h3>
              <div className="flex items-center gap-2 text-primary font-body-sm">
                <span className="material-symbols-outlined text-sm">trending_up</span>
                <span>+12% <span className="text-outline">vs last month</span></span>
              </div>
            </div>
            <div className="glass-card p-widget-padding rounded-xl relative overflow-hidden">
              <div className="flex justify-between items-start mb-4">
                <p className="font-label-caps text-label-caps text-outline">Net New MRR</p>
                <span className="material-symbols-outlined text-tertiary">add_chart</span>
              </div>
              <h3 className="font-display-lg text-3xl font-bold text-on-surface mb-2 tracking-tight">${revenue?.netNewMRR.toLocaleString()}</h3>
              <div className="flex items-center gap-2 text-emerald-400 font-body-sm">
                <span className="material-symbols-outlined text-sm">trending_up</span>
                <span>+8% <span className="text-outline">vs last month</span></span>
              </div>
            </div>
            <div className="glass-card p-widget-padding rounded-xl relative overflow-hidden">
              <div className="flex justify-between items-start mb-4">
                <p className="font-label-caps text-label-caps text-outline">Expansion MRR</p>
                <span className="material-symbols-outlined text-primary-fixed-dim">upgrade</span>
              </div>
              <h3 className="font-display-lg text-3xl font-bold text-on-surface mb-2 tracking-tight">${revenue?.expansionMRR.toLocaleString()}</h3>
              <div className="flex items-center gap-2 text-emerald-400 font-body-sm">
                <span className="material-symbols-outlined text-sm">trending_up</span>
                <span>+2% <span className="text-outline">vs last month</span></span>
              </div>
            </div>
            <div className="glass-card p-widget-padding rounded-xl relative overflow-hidden">
              <div className="flex justify-between items-start mb-4">
                <p className="font-label-caps text-label-caps text-outline">Churned MRR</p>
                <span className="material-symbols-outlined text-error">person_remove</span>
              </div>
              <h3 className="font-display-lg text-3xl font-bold text-on-surface mb-2 tracking-tight">${revenue?.churnedMRR.toLocaleString()}</h3>
              <div className="flex items-center gap-2 text-error font-body-sm">
                <span className="material-symbols-outlined text-sm">trending_down</span>
                <span>-1.5% <span className="text-outline">vs last month</span></span>
              </div>
            </div>
          </section>
          <section className="glass-card p-widget-padding rounded-xl min-h-[400px] flex flex-col">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="font-headline-md text-headline-md font-bold text-on-surface">Revenue Breakdown</h2>
                <p className="font-body-sm text-body-sm text-outline">Stacked performance over the last 12 months</p>
              </div>
              <div className="flex gap-4 items-center">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-primary"></div>
                  <span className="text-xs font-label-caps text-on-surface-variant">Retention</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-secondary"></div>
                  <span className="text-xs font-label-caps text-on-surface-variant">Expansion</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-outline"></div>
                  <span className="text-xs font-label-caps text-on-surface-variant">New Revenue</span>
                </div>
              </div>
            </div>
            <div className="flex-grow flex items-end gap-1 relative overflow-hidden h-64 border-b border-outline-variant/30">
              <div className="absolute inset-0 z-0 opacity-10 pointer-events-none" style={{ background: "linear-gradient(to bottom, #d0bcff 0%, transparent 100%)" }}></div>
              <div className="absolute inset-0 flex justify-between px-2">
                <div className="w-px h-full bg-outline-variant/20"></div>
                <div className="w-px h-full bg-outline-variant/20"></div>
                <div className="w-px h-full bg-outline-variant/20"></div>
                <div className="w-px h-full bg-outline-variant/20"></div>
                <div className="w-px h-full bg-outline-variant/20"></div>
                <div className="w-px h-full bg-outline-variant/20"></div>
              </div>
              <div className="relative w-full h-full flex items-end justify-between px-4 pb-2">
                <svg className="absolute inset-0 w-full h-full preserve-3d" preserveAspectRatio="none" viewBox="0 0 1000 200">
                  <path d="M0 200 L0 80 Q 250 50, 500 70 T 1000 40 L 1000 200 Z" fill="url(#grad1)" fillOpacity="0.6"></path>
                  <path d="M0 80 Q 250 50, 500 70 T 1000 40 L 1000 10 Q 500 30, 0 10 Z" fill="#cebdff" fillOpacity="0.4"></path>
                  <path d="M0 10 Q 500 30, 1000 10 L 1000 0 L 0 0 Z" fill="#958ea0" fillOpacity="0.2"></path>
                  <defs>
                    <linearGradient id="grad1" x1="0%" x2="0%" y1="0%" y2="100%">
                      <stop offset="0%" style={{ stopColor: "#d0bcff", stopOpacity: 1 }}></stop>
                      <stop offset="100%" style={{ stopColor: "#d0bcff", stopOpacity: 0 }}></stop>
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>
            <div className="flex justify-between text-label-caps text-outline mt-4 px-4 font-data-mono">
              <span>JAN</span><span>FEB</span><span>MAR</span><span>APR</span><span>MAY</span><span>JUN</span><span>JUL</span><span>AUG</span><span>SEP</span><span>OCT</span><span>NOV</span><span>DEC</span>
            </div>
          </section>
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-gutter">
            <div className="glass-card p-widget-padding rounded-xl">
              <div className="flex justify-between items-center mb-6">
                <h2 className="font-headline-md text-headline-md font-bold text-on-surface">Plan Distribution</h2>
                <button className="text-primary font-body-sm flex items-center gap-1">
                  View Details <span className="material-symbols-outlined text-sm">open_in_new</span>
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="border-b border-outline-variant/30">
                    <tr className="text-outline font-label-caps">
                      <th className="pb-3 px-2">Plan Name</th>
                      <th className="pb-3 px-2">Subscribers</th>
                      <th className="pb-3 px-2">ARPU</th>
                      <th className="pb-3 px-2 text-right">MRR Contribution</th>
                    </tr>
                  </thead>
                  <tbody className="font-body-sm text-on-surface-variant">
                    <tr className="border-b border-outline-variant/20 hover:bg-surface-variant/20 transition-colors">
                      <td className="py-4 px-2 font-medium text-on-surface">Starter</td>
                      <td className="py-4 px-2 font-data-mono">1,240</td>
                      <td className="py-4 px-2 font-data-mono">$49.00</td>
                      <td className="py-4 px-2 font-data-mono text-right">$60,760</td>
                    </tr>
                    <tr className="border-b border-outline-variant/20 hover:bg-surface-variant/20 transition-colors">
                      <td className="py-4 px-2 font-medium text-on-surface">Pro</td>
                      <td className="py-4 px-2 font-data-mono">842</td>
                      <td className="py-4 px-2 font-data-mono">$149.00</td>
                      <td className="py-4 px-2 font-data-mono text-right">$125,458</td>
                    </tr>
                    <tr className="hover:bg-surface-variant/20 transition-colors">
                      <td className="py-4 px-2 font-medium text-on-surface">Enterprise</td>
                      <td className="py-4 px-2 font-data-mono">52</td>
                      <td className="py-4 px-2 font-data-mono">$1,190.00</td>
                      <td className="py-4 px-2 font-data-mono text-right">$61,880</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div className="glass-card p-widget-padding rounded-xl">
              <h2 className="font-headline-md text-headline-md font-bold text-on-surface mb-6">Monthly Cohort Retention</h2>
              <div className="grid grid-cols-8 gap-1.5">
                <div className="col-span-1"></div>
                <div className="text-center font-label-caps text-outline text-[10px]">M0</div>
                <div className="text-center font-label-caps text-outline text-[10px]">M1</div>
                <div className="text-center font-label-caps text-outline text-[10px]">M2</div>
                <div className="text-center font-label-caps text-outline text-[10px]">M3</div>
                <div className="text-center font-label-caps text-outline text-[10px]">M4</div>
                <div className="text-center font-label-caps text-outline text-[10px]">M5</div>
                <div className="text-center font-label-caps text-outline text-[10px]">M6</div>
                <div className="font-label-caps text-outline text-[10px] flex items-center">JAN</div>
                <div className="aspect-square rounded bg-primary flex items-center justify-center text-[10px] font-bold text-on-primary">100%</div>
                <div className="aspect-square rounded bg-primary/90 flex items-center justify-center text-[10px] font-bold text-on-primary">92%</div>
                <div className="aspect-square rounded bg-primary/80 flex items-center justify-center text-[10px] font-bold text-on-primary">88%</div>
                <div className="aspect-square rounded bg-primary/70 flex items-center justify-center text-[10px] font-bold text-on-primary">85%</div>
                <div className="aspect-square rounded bg-primary/60 flex items-center justify-center text-[10px] font-bold text-on-primary">82%</div>
                <div className="aspect-square rounded bg-primary/60 flex items-center justify-center text-[10px] font-bold text-on-primary">82%</div>
                <div className="aspect-square rounded bg-primary/50 flex items-center justify-center text-[10px] font-bold text-on-primary">81%</div>
                <div className="font-label-caps text-outline text-[10px] flex items-center">FEB</div>
                <div className="aspect-square rounded bg-primary flex items-center justify-center text-[10px] font-bold text-on-primary">100%</div>
                <div className="aspect-square rounded bg-primary/80 flex items-center justify-center text-[10px] font-bold text-on-primary">89%</div>
                <div className="aspect-square rounded bg-primary/70 flex items-center justify-center text-[10px] font-bold text-on-primary">84%</div>
                <div className="aspect-square rounded bg-primary/60 flex items-center justify-center text-[10px] font-bold text-on-primary">81%</div>
                <div className="aspect-square rounded bg-primary/50 flex items-center justify-center text-[10px] font-bold text-on-primary">78%</div>
                <div className="aspect-square rounded bg-primary/40 flex items-center justify-center text-[10px] font-bold text-on-primary">75%</div>
                <div className="aspect-square rounded bg-primary/30 flex items-center justify-center text-[10px] font-bold text-on-primary">72%</div>
                <div className="font-label-caps text-outline text-[10px] flex items-center">MAR</div>
                <div className="aspect-square rounded bg-primary flex items-center justify-center text-[10px] font-bold text-on-primary">100%</div>
                <div className="aspect-square rounded bg-primary/90 flex items-center justify-center text-[10px] font-bold text-on-primary">94%</div>
                <div className="aspect-square rounded bg-primary/80 flex items-center justify-center text-[10px] font-bold text-on-primary">91%</div>
                <div className="aspect-square rounded bg-primary/80 flex items-center justify-center text-[10px] font-bold text-on-primary">91%</div>
                <div className="aspect-square rounded bg-primary/70 flex items-center justify-center text-[10px] font-bold text-on-primary">88%</div>
                <div className="aspect-square rounded bg-primary/60 flex items-center justify-center text-[10px] font-bold text-on-primary">85%</div>
                <div className="aspect-square rounded bg-primary/60 flex items-center justify-center text-[10px] font-bold text-on-primary">84%</div>
                <div className="font-label-caps text-outline text-[10px] flex items-center">APR</div>
                <div className="aspect-square rounded bg-primary flex items-center justify-center text-[10px] font-bold text-on-primary">100%</div>
                <div className="aspect-square rounded bg-primary/90 flex items-center justify-center text-[10px] font-bold text-on-primary">96%</div>
                <div className="aspect-square rounded bg-primary/90 flex items-center justify-center text-[10px] font-bold text-on-primary">95%</div>
                <div className="aspect-square rounded bg-primary/80 flex items-center justify-center text-[10px] font-bold text-on-primary">91%</div>
                <div className="aspect-square rounded bg-primary/80 flex items-center justify-center text-[10px] font-bold text-on-primary">90%</div>
                <div className="aspect-square rounded bg-primary/70 flex items-center justify-center text-[10px] font-bold text-on-primary">88%</div>
                <div className="aspect-square rounded bg-primary/10 flex items-center justify-center text-[10px] font-bold text-outline">...</div>
              </div>
              <div className="mt-8 pt-4 border-t border-outline-variant/30 flex justify-between items-center">
                <p className="font-body-sm text-body-sm text-outline">Average Retention (M6): <span className="text-primary font-bold">82.4%</span></p>
                <div className="flex items-center gap-1">
                  <div className="h-2 w-16 rounded-full bg-surface-container-lowest overflow-hidden">
                    <div className="h-full bg-primary w-[82%]"></div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-surface-container-high border-t border-outline-variant/30 flex items-center justify-around z-50">
        <button className="flex flex-col items-center gap-1 text-primary">
          <span className="material-symbols-outlined">dashboard</span>
          <span className="text-[10px] font-bold">Dashboard</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-on-surface-variant">
          <span className="material-symbols-outlined">payments</span>
          <span className="text-[10px]">Revenue</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-on-surface-variant">
          <span className="material-symbols-outlined">group</span>
          <span className="text-[10px]">Customers</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-on-surface-variant">
          <span className="material-symbols-outlined">query_stats</span>
          <span className="text-[10px]">Forecast</span>
        </button>
      </nav>
    </div>
  );
};

export default RevenueDashboard;