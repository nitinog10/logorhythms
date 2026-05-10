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

const ApiUsagePage = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [apiUsages, setApiUsages] = useState<APIUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [usersRes, subscriptionsRes, apiUsagesRes] = await Promise.all([
          axios.get('/api/users'),
          axios.get('/api/subscriptions'),
          axios.get('/api/api-usages'),
        ]);
        setUsers(usersRes.data);
        setSubscriptions(subscriptionsRes.data);
        setApiUsages(apiUsagesRes.data);
      } catch (err) {
        setError('Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="bg-background text-on-surface">
      <aside className="h-full w-64 fixed left-0 top-0 bg-surface-container border-r border-outline-variant flex flex-col p-4 z-50">
        <div className="mb-8 px-4">
          <h1 className="text-headline-md font-headline-md text-primary">Quantix</h1>
          <p className="text-on-surface-variant font-body-sm text-[10px] tracking-widest uppercase">Technical Operations</p>
        </div>
        <nav className="flex-1 space-y-1">
          <a className="flex items-center gap-3 px-4 py-3 text-on-surface-variant hover:text-on-surface hover:bg-surface-bright transition-colors duration-200 active:scale-95" href="#">
            <span className="material-symbols-outlined" data-icon="dashboard">dashboard</span>
            <span className="font-body-base text-body-base">Overview</span>
          </a>
          <a className="flex items-center gap-3 px-4 py-3 text-on-surface-variant hover:text-on-surface hover:bg-surface-bright transition-colors duration-200 active:scale-95" href="#">
            <span className="material-symbols-outlined" data-icon="group">group</span>
            <span className="font-body-base text-body-base">Users</span>
          </a>
          <a className="flex items-center gap-3 px-4 py-3 bg-secondary-container text-on-secondary-container rounded-lg font-bold active:scale-95 transition-transform" href="#">
            <span className="material-symbols-outlined" data-icon="analytics">analytics</span>
            <span className="font-body-base text-body-base">Analytics</span>
          </a>
          <a className="flex items-center gap-3 px-4 py-3 text-on-surface-variant hover:text-on-surface hover:bg-surface-bright transition-colors duration-200 active:scale-95" href="#">
            <span className="material-symbols-outlined" data-icon="api">api</span>
            <span className="font-body-base text-body-base">API</span>
          </a>
          <a className="flex items-center gap-3 px-4 py-3 text-on-surface-variant hover:text-on-surface hover:bg-surface-bright transition-colors duration-200 active:scale-95" href="#">
            <span className="material-symbols-outlined" data-icon="settings">settings</span>
            <span className="font-body-base text-body-base">Settings</span>
          </a>
        </nav>
        <div className="mt-auto p-4 bg-surface-container-low rounded-xl border border-outline-variant">
          <div className="flex items-center gap-3">
            <img alt="Quantix System Avatar" className="w-10 h-10 rounded-full" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDKcggSpWEbMJsz3dLFcJCENPVyfhQD6-SjA6EoXmc_KSTV4JDZJUxx8TXc3H0ASiljvLOGOt-LasH7Iz4J4k2UrI1zVaB9JpyoHIHA5RKoeOKYJKt2QPLLps1_OhT5n7JMH__5sziDBF6CMvoNEkGcaG-4GLoHxv1HswvmIwFdbFn7KGCv7TTGGqRNE1rKtUbm-aFlgzHEhIuUOqyTq2XkQTLxYbQ0cgLb-vFNKgOr1zJzTpoQ_WOtlyITx6Irv0PqMpXxrq9YU-U"/>
            <div>
              <p className="font-bold text-body-sm">System Admin</p>
              <p className="text-[10px] text-primary">Node-04 Active</p>
            </div>
          </div>
        </div>
      </aside>
      <header className="fixed top-0 right-0 w-[calc(100%-16rem)] h-16 bg-surface/70 backdrop-blur-md border-b border-outline-variant flex justify-between items-center px-6 z-40">
        <div className="flex items-center gap-4 flex-1">
          <div className="relative w-full max-w-md">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm" data-icon="search">search</span>
            <input className="bg-surface-container-lowest border border-outline-variant rounded-lg pl-10 pr-4 py-1.5 w-full text-body-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all" placeholder="Search API logs, endpoints, or keys..." type="text"/>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4">
            <span className="material-symbols-outlined text-on-surface-variant hover:text-primary cursor-pointer transition-colors active:opacity-80" data-icon="notifications">notifications</span>
            <span className="material-symbols-outlined text-on-surface-variant hover:text-primary cursor-pointer transition-colors active:opacity-80" data-icon="help">help</span>
          </div>
          <div className="h-8 w-[1px] bg-outline-variant"></div>
          <div className="flex items-center gap-3 cursor-pointer active:opacity-80">
            <span className="text-body-sm font-bold">Quantix Monitoring</span>
            <div className="w-8 h-8 rounded-lg bg-primary-container flex items-center justify-center">
              <span className="material-symbols-outlined text-on-primary-container text-xl" data-icon="terminal">terminal</span>
            </div>
          </div>
        </div>
      </header>
      <main className="ml-64 pt-24 pb-12 px-8 min-h-screen">
        <div className="max-w-[1600px] mx-auto space-y-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h2 className="text-display-lg font-display-lg text-on-surface">API Performance</h2>
              <p className="text-on-surface-variant font-body-base">Real-time telemetry and throughput metrics across all clusters.</p>
            </div>
            <div className="flex gap-3">
              <button className="px-4 py-2 bg-surface-container-high border border-outline-variant text-on-surface rounded-lg font-label-caps text-label-caps flex items-center gap-2 hover:bg-surface-bright transition-all">
                <span className="material-symbols-outlined text-sm" data-icon="calendar_today">calendar_today</span>
                LAST 24 HOURS
              </button>
              <button className="px-4 py-2 bg-primary text-on-primary rounded-lg font-label-caps text-label-caps flex items-center gap-2 hover:brightness-110 active:scale-95 transition-all">
                <span className="material-symbols-outlined text-sm" data-icon="download">download</span>
                EXPORT DATA
              </button>
            </div>
          </div>
          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-12 glass-card rounded-xl p-6 relative overflow-hidden">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="font-headline-md text-headline-md flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary" data-icon="insights">insights</span>
                    Call Volume
                  </h3>
                  <p className="text-on-surface-variant text-body-sm">Request throughput in req/hr</p>
                </div>
                <div className="text-right">
                  <span className="text-display-lg font-display-lg text-primary leading-none">1.2M</span>
                  <p className="text-[10px] text-tertiary-fixed font-bold tracking-widest uppercase">+14.2% VS LAST PERIOD</p>
                </div>
              </div>
              <div className="h-64 w-full relative group">
                <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 1000 100">
                  <defs>
                    <linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.3"></stop>
                      <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0"></stop>
                    </linearGradient>
                  </defs>
                  <path d="M0,80 Q50,70 100,85 T200,60 T300,75 T400,40 T500,55 T600,20 T700,45 T800,30 T900,50 L1000,10 V100 H0 Z" fill="url(#chartGradient)"></path>
                  <path d="M0,80 Q50,70 100,85 T200,60 T300,75 T400,40 T500,55 T600,20 T700,45 T800,30 T900,50 L1000,10" fill="none" stroke="#d0bcff" strokeWidth="2"></path>
                  <line stroke="#1E293B" strokeWidth="1" x1="0" x2="1000" y1="20" y2="20"></line>
                  <line stroke="#1E293B" strokeWidth="1" x1="0" x2="1000" y1="40" y2="40"></line>
                  <line stroke="#1E293B" strokeWidth="1" x1="0" x2="1000" y1="60" y2="60"></line>
                  <line stroke="#1E293B" strokeWidth="1" x1="0" x2="1000" y1="80" y2="80"></line>
                </svg>
                <div className="flex justify-between mt-4 text-[10px] font-data-mono text-outline">
                  <span>00:00</span><span>04:00</span><span>08:00</span><span>12:00</span><span>16:00</span><span>20:00</span><span>23:59</span>
                </div>
              </div>
            </div>
            <div className="col-span-12 xl:col-span-8 glass-card rounded-xl overflow-hidden">
              <div className="p-6 border-b border-outline-variant bg-surface-container/30">
                <h3 className="font-headline-md text-headline-md">Endpoint Breakdown</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low text-on-surface-variant font-label-caps text-label-caps">
                      <th className="px-6 py-4 font-semibold">ENDPOINT PATH</th>
                      <th className="px-6 py-4 font-semibold">METHOD</th>
                      <th className="px-6 py-4 font-semibold text-right">AVG LATENCY</th>
                      <th className="px-6 py-4 font-semibold text-right">ERROR RATE</th>
                      <th className="px-6 py-4 font-semibold text-right">CALL COUNT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/30">
                    {apiUsages.map((usage) => (
                      <tr key={usage.id} className="hover:bg-surface-bright/50 transition-colors">
                        <td className="px-6 py-4 font-data-mono text-data-mono text-primary">{usage.endpoint}</td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 bg-secondary-container/20 text-secondary rounded text-[10px] font-bold">{usage.method}</span>
                        </td>
                        <td className="px-6 py-4 text-right font-data-mono">{usage.avgLatency}ms</td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-on-surface bg-surface-container-high px-2 py-0.5 rounded text-[11px]">{usage.errorRate}%</span>
                        </td>
                        <td className="px-6 py-4 text-right font-data-mono">{usage.id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="col-span-12 xl:col-span-4 glass-card rounded-xl p-6">
              <h3 className="font-headline-md text-headline-md mb-6">Rate Limit Quotas</h3>
              <div className="space-y-6">
                <div className="space-y-2">
                  <div className="flex justify-between text-body-sm">
                    <span className="font-data-mono text-primary">Key: prod_main_01</span>
                    <span className="text-on-surface-variant">82% used</span>
                  </div>
                  <div className="h-2 w-full bg-surface-container-highest rounded-full overflow-hidden">
                    <div className="h-full bg-tertiary-container w-[82%]"></div>
                  </div>
                  <div className="flex justify-between text-[10px] text-outline">
                    <span>Reset in 42m</span>
                    <span>8,200 / 10,000 req</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-body-sm">
                    <span className="font-data-mono text-primary">Key: analytics_svc</span>
                    <span className="text-on-surface-variant">24% used</span>
                  </div>
                  <div className="h-2 w-full bg-surface-container-highest rounded-full overflow-hidden">
                    <div className="h-full bg-primary w-[24%]"></div>
                  </div>
                  <div className="flex justify-between text-[10px] text-outline">
                    <span>Reset in 12m</span>
                    <span>12,040 / 50,000 req</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-body-sm">
                    <span className="font-data-mono text-primary">Key: web_frontend</span>
                    <span className="text-on-surface-variant">98% used</span>
                  </div>
                  <div className="h-2 w-full bg-surface-container-highest rounded-full overflow-hidden">
                    <div className="h-full bg-error w-[98%]"></div>
                  </div>
                  <div className="flex justify-between text-[10px] text-error font-bold">
                    <span>CRITICAL - LIMIT NEAR</span>
                    <span>98,202 / 100,000 req</span>
                  </div>
                </div>
              </div>
              <button className="w-full mt-8 py-3 border border-outline-variant border-dashed rounded-lg text-body-sm text-on-surface-variant hover:border-primary hover:text-primary transition-all flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-sm" data-icon="add">add</span>
                PROVISION NEW API KEY
              </button>
            </div>
            <div className="col-span-12 glass-card rounded-xl overflow-hidden">
              <div className="p-6 border-b border-outline-variant flex items-center justify-between">
                <h3 className="font-headline-md text-headline-md flex items-center gap-2">
                  <span className="material-symbols-outlined text-error" data-icon="terminal">terminal</span>
                  Live Error Stream
                </h3>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-error animate-pulse"></span>
                  <span className="text-[10px] font-bold text-error tracking-widest">LIVE</span>
                </div>
              </div>
              <div className="max-h-[400px] overflow-y-auto custom-scrollbar font-data-mono text-sm">
                <div className="divide-y divide-outline-variant/20">
                  {apiUsages.map((usage) => (
                    <div key={usage.id} className="p-4 grid grid-cols-12 gap-4 hover:bg-surface-bright/20">
                      <div className="col-span-2 text-outline">14:22:01.442</div>
                      <div className="col-span-1 font-bold text-error">500</div>
                      <div className="col-span-2 text-primary">POST {usage.endpoint}</div>
                      <div className="col-span-7 text-on-surface-variant italic truncate">Database connection timeout in shard-us-east-1a...</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      <footer className="ml-64 px-8 py-6 border-t border-outline-variant flex justify-between items-center bg-surface-container-lowest">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#10b981]"></span>
            <span className="text-[10px] font-bold text-outline">ALL SYSTEMS OPERATIONAL</span>
          </div>
          <div className="h-4 w-[1px] bg-outline-variant"></div>
          <span className="text-[10px] text-outline uppercase font-label-caps">Quantix v2.4.1-stable</span>
        </div>
        <div className="flex gap-4 text-[10px] text-outline font-label-caps">
          <a className="hover:text-primary transition-colors" href="#">API DOCS</a>
          <a className="hover:text-primary transition-colors" href="#">STATUS PAGE</a>
          <a className="hover:text-primary transition-colors" href="#">SUPPORT</a>
        </div>
      </footer>
    </div>
  );
};

export default ApiUsagePage;