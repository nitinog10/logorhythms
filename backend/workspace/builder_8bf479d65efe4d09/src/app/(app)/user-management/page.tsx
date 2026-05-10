import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';

type User = {
  id: string;
  email: string;
  name: string;
  status: 'active' | 'trial' | 'churned' | 'suspended';
  createdAt: string;
};

type Subscription = {
  id: string;
  userId: string;
  plan: string;
  startDate: string;
  endDate: string;
};

const UserManagement = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const usersResponse = await axios.get('/api/users');
        const subscriptionsResponse = await axios.get('/api/subscriptions');
        setUsers(usersResponse.data);
        setSubscriptions(subscriptionsResponse.data);
        setIsLoading(false);
      } catch (err) {
        setError('Failed to load data');
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, []);

  const handleFilterChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilterStatus(e.target.value);
  }, []);

  const handleCheckboxChange = useCallback((userId: string) => {
    setSelectedUsers((prev) =>
      prev.includes(userId)? prev.filter((id) => id!== userId) : [...prev, userId]
    );
  }, []);

  const handleExport = useCallback(() => {
    // Implement export logic
  }, []);

  const handleChangePlan = useCallback(() => {
    // Implement change plan logic
  }, []);

  const handleSuspend = useCallback(() => {
    // Implement suspend logic
  }, []);

  const filteredUsers = users.filter((user) => {
    if (searchQuery &&!user.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (filterStatus!== 'All' && user.status!== filterStatus.toLowerCase()) return false;
    return true;
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="flex h-screen bg-background text-on-background font-body-md overflow-hidden">
      <aside className="hidden md:flex flex-col h-full py-stack-md px-4 gap-stack-sm bg-surface-container-low text-primary border-r border-outline-variant w-64 shrink-0">
        <div className="flex items-center gap-3 px-2 mb-6">
          <div className="w-10 h-10 rounded-lg bg-primary-container flex items-center justify-center">
            <span className="material-symbols-outlined text-on-primary-container">diamond</span>
          </div>
          <div>
            <h1 className="font-headline-lg text-headline-lg font-bold text-on-surface">Obsidian</h1>
            <p className="font-label-sm text-label-sm opacity-70">Enterprise Analytics</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1">
          <div className="text-on-surface-variant font-medium hover:bg-surface-variant rounded-lg cursor-pointer active:scale-95 transition-all p-3 flex items-center gap-3">
            <span className="material-symbols-outlined">dashboard</span>
            <span className="font-label-sm text-label-sm">Overview</span>
          </div>
          <div className="bg-secondary-container text-on-secondary-container rounded-lg font-bold cursor-pointer active:scale-95 transition-all p-3 flex items-center gap-3">
            <span className="material-symbols-outlined">group</span>
            <span className="font-label-sm text-label-sm">User Management</span>
          </div>
          <div className="text-on-surface-variant font-medium hover:bg-surface-variant rounded-lg cursor-pointer active:scale-95 transition-all p-3 flex items-center gap-3">
            <span className="material-symbols-outlined">payments</span>
            <span className="font-label-sm text-label-sm">Revenue</span>
          </div>
          <div className="text-on-surface-variant font-medium hover:bg-surface-variant rounded-lg cursor-pointer active:scale-95 transition-all p-3 flex items-center gap-3">
            <span className="material-symbols-outlined">monitoring</span>
            <span className="font-label-sm text-label-sm">Analytics</span>
          </div>
          <div className="text-on-surface-variant font-medium hover:bg-surface-variant rounded-lg cursor-pointer active:scale-95 transition-all p-3 flex items-center gap-3">
            <span className="material-symbols-outlined">history</span>
            <span className="font-label-sm text-label-sm">Audit Logs</span>
          </div>
        </nav>
        <div className="mt-auto space-y-1 border-t border-outline-variant pt-4">
          <button className="w-full bg-primary text-on-primary font-bold py-3 rounded-lg mb-4 flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
            <span className="material-symbols-outlined">add</span>
            <span className="font-label-sm text-label-sm">New Report</span>
          </button>
          <div className="text-on-surface-variant font-medium hover:bg-surface-variant rounded-lg cursor-pointer active:scale-95 transition-all p-3 flex items-center gap-3">
            <span className="material-symbols-outlined">help</span>
            <span className="font-label-sm text-label-sm">Support</span>
          </div>
          <div className="text-on-surface-variant font-medium hover:bg-surface-variant rounded-lg cursor-pointer active:scale-95 transition-all p-3 flex items-center gap-3">
            <span className="material-symbols-outlined">description</span>
            <span className="font-label-sm text-label-sm">Documentation</span>
          </div>
        </div>
      </aside>
      <main className="flex-1 flex flex-col min-w-0 bg-surface">
        <header className="flex justify-between items-center w-full px-gutter h-16 bg-surface text-primary border-b border-outline-variant shrink-0">
          <div className="flex items-center gap-stack-md w-1/3">
            <div className="relative w-full max-w-sm">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
              <input
                className="w-full bg-surface-container-low border border-outline-variant rounded-full pl-10 pr-4 py-1.5 font-body-md text-on-surface focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                placeholder="Search Obsidian..."
                type="text"
                value={searchQuery}
                onChange={handleSearch}
              />
            </div>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <span className="text-on-surface-variant font-medium hover:text-primary transition-colors cursor-pointer font-body-md">Dashboard</span>
            <span className="text-primary font-bold border-b-2 border-primary pb-1 cursor-pointer font-body-md">Users</span>
            <span className="text-on-surface-variant font-medium hover:text-primary transition-colors cursor-pointer font-body-md">Reports</span>
            <span className="text-on-surface-variant font-medium hover:text-primary transition-colors cursor-pointer font-body-md">Billing</span>
          </div>
          <div className="flex items-center gap-4 w-1/3 justify-end">
            <span className="material-symbols-outlined text-on-surface-variant cursor-pointer hover:text-primary transition-colors">notifications</span>
            <span className="material-symbols-outlined text-on-surface-variant cursor-pointer hover:text-primary transition-colors">settings</span>
            <div className="w-8 h-8 rounded-full overflow-hidden border border-outline-variant cursor-pointer active:opacity-80">
              <img alt="User profile" className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuACm5WBZnqI_5uuYecB9nPrGRmiXMqC6kuI1EIXUv5uYMghCXX9dtyw3jMXi242Zz6GILkB1q0a6Sgd584hzyojtSUwr-ofRel0TT30CvdFvDZGAWEhZets12_1_badvSepQF0bdy87beOE4wDKrh6Sy6gnTi3MmRGb-xjTMV7NZrK4r59mjW_LErtTr4Ep_4eW-SPei0XeDjv66uMcyxhASword12glhMebIW9XZ4uVI0dbVvkE_tEyTkH1lYu06iRbXgj-yVDlqQ" />
            </div>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-gutter space-y-gutter">
          <section className="grid grid-cols-1 md:grid-cols-4 gap-card-gap">
            <div className="bg-surface-container-low border border-outline-variant rounded-xl p-stack-md relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-6xl">group</span>
              </div>
              <p className="font-label-sm text-label-sm text-on-surface-variant mb-2 uppercase tracking-wider">Total Users</p>
              <h2 className="font-headline-xl text-headline-xl text-on-surface">8,432</h2>
              <div className="mt-4 flex items-center gap-2">
                <span className="flex items-center text-tertiary font-medium text-xs">
                  <span className="material-symbols-outlined text-sm">trending_up</span> 12%
                </span>
                <span className="text-on-surface-variant text-xs font-label-sm">vs last month</span>
              </div>
            </div>
            <div className="bg-surface-container-low border border-outline-variant rounded-xl p-stack-md relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-6xl text-primary">person_check</span>
              </div>
              <p className="font-label-sm text-label-sm text-on-surface-variant mb-2 uppercase tracking-wider">Active</p>
              <h2 className="font-headline-xl text-headline-xl text-on-surface">6,210</h2>
              <div className="mt-4 flex items-center gap-2">
                <span className="flex items-center text-tertiary font-medium text-xs">
                  <span className="material-symbols-outlined text-sm">trending_up</span> 4.5%
                </span>
                <span className="text-on-surface-variant text-xs font-label-sm">73.6% retention</span>
              </div>
            </div>
            <div className="bg-surface-container-low border border-outline-variant rounded-xl p-stack-md relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-6xl text-secondary">hourglass_empty</span>
              </div>
              <p className="font-label-sm text-label-sm text-on-surface-variant mb-2 uppercase tracking-wider">Trial</p>
              <h2 className="font-headline-xl text-headline-xl text-on-surface">1,150</h2>
              <div className="mt-4 flex items-center gap-2">
                <span className="flex items-center text-error font-medium text-xs">
                  <span className="material-symbols-outlined text-sm">trending_down</span> 2.1%
                </span>
                <span className="text-on-surface-variant text-xs font-label-sm">Conversion focus</span>
              </div>
            </div>
            <div className="bg-surface-container-low border border-outline-variant rounded-xl p-stack-md relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-6xl text-error">person_off</span>
              </div>
              <p className="font-label-sm text-label-sm text-on-surface-variant mb-2 uppercase tracking-wider">Churned</p>
              <h2 className="font-headline-xl text-headline-xl text-on-surface">1,072</h2>
              <div className="mt-4 flex items-center gap-2">
                <span className="flex items-center text-on-surface-variant font-medium text-xs">
                  <span className="material-symbols-outlined text-sm">remove</span> Stable
                </span>
                <span className="text-on-surface-variant text-xs font-label-sm">Last 30 days</span>
              </div>
            </div>
          </section>
          <section className="flex flex-col md:flex-row items-center justify-between gap-stack-md bg-surface-container-low border border-outline-variant p-4 rounded-xl">
            <div className="flex items-center gap-stack-md w-full md:w-auto">
              <div className="relative w-full md:w-80">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">search</span>
                <input
                  className="w-full bg-surface border border-outline-variant rounded-lg pl-9 pr-4 py-2 font-body-md text-on-surface focus:ring-2 focus:ring-primary focus:border-transparent outline-none text-sm"
                  placeholder="Search by name or email..."
                  type="text"
                  value={searchQuery}
                  onChange={handleSearch}
                />
              </div>
              <div className="relative min-w-[140px]">
                <select
                  className="w-full appearance-none bg-surface border border-outline-variant rounded-lg px-4 py-2 pr-10 font-label-sm text-on-surface-variant focus:ring-2 focus:ring-primary outline-none cursor-pointer"
                  value={filterStatus}
                  onChange={handleFilterChange}
                >
                  <option>Status: All</option>
                  <option>Active</option>
                  <option>Trial</option>
                  <option>Churned</option>
                  <option>Suspended</option>
                </select>
                <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">expand_more</span>
              </div>
            </div>
            <div className="flex items-center gap-2 opacity-100 transition-opacity">
              <span className="text-xs font-label-sm text-on-surface-variant mr-2">{selectedUsers.length} users selected</span>
              <button
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-outline-variant hover:bg-surface-variant transition-colors text-xs font-bold text-on-surface"
                onClick={handleExport}
              >
                <span className="material-symbols-outlined text-sm">download</span> Export
              </button>
              <button
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-outline-variant hover:bg-surface-variant transition-colors text-xs font-bold text-on-surface"
                onClick={handleChangePlan}
              >
                <span className="material-symbols-outlined text-sm">upgrade</span> Change Plan
              </button>
              <button
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-error text-error hover:bg-error/10 transition-colors text-xs font-bold"
                onClick={handleSuspend}
              >
                <span className="material-symbols-outlined text-sm">block</span> Suspend
              </button>
            </div>
          </section>
          <section className="bg-surface-container-low border border-outline-variant rounded-xl overflow-hidden">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-high border-b border-outline-variant">
                    <th className="p-4 w-12">
                      <input className="rounded border-outline-variant bg-surface text-primary focus:ring-primary" type="checkbox" />
                    </th>
                    <th className="p-4 font-label-sm text-on-surface-variant uppercase tracking-wider text-[11px]">User</th>
                    <th className="p-4 font-label-sm text-on-surface-variant uppercase tracking-wider text-[11px]">Plan</th>
                    <th className="p-4 font-label-sm text-on-surface-variant uppercase tracking-wider text-[11px]">MRR</th>
                    <th className="p-4 font-label-sm text-on-surface-variant uppercase tracking-wider text-[11px]">Last Active</th>
                    <th className="p-4 font-label-sm text-on-surface-variant uppercase tracking-wider text-[11px]">Status</th>
                    <th className="p-4 w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-surface-variant/50 transition-colors group">
                      <td className="p-4">
                        <input
                          className="rounded border-outline-variant bg-surface text-primary focus:ring-primary"
                          type="checkbox"
                          checked={selectedUsers.includes(user.id)}
                          onChange={() => handleCheckboxChange(user.id)}
                        />
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg overflow-hidden border border-outline-variant">
                            <img alt="User" className="w-full h-full object-cover" src={`https://lh3.googleusercontent.com/aida-public/AB6AXuACm5WBZnqI_5uuYecB9nPrGRmiXMqC6kuI1EIXUv5uYMghCXX9dtyw3jMXi242Zz6GILkB1q0a6Sgd584hzyojtSUwr-ofRel0TT30CvdFvDZGAWEhZets12_1_badvSepQF0bdy87beOE4wDKrh6Sy6gnTi3MmRGb-xjTMV7NZrK4r59mjW_LErtTr4Ep_4eW-SPei0XeDjv66uMcyxhASword12glhMebIW9XZ4uVI0dbVvkE_tEyTkH1lYu06iRbXgj-yVDlqQ`} />
                          </div>
                          <div>
                            <p className="font-body-md font-bold text-on-surface">{user.name}</p>
                            <p className="text-xs text-on-surface-variant">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="px-2 py-1 rounded bg-tertiary-container/20 text-tertiary text-[10px] font-bold uppercase tracking-tighter border border-tertiary/30">Enterprise</span>
                      </td>
                      <td className="p-4 font-body-md text-on-surface">$499.00</td>
                      <td className="p-4 text-xs text-on-surface-variant">2 hours ago</td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-tertiary"></span>
                          <span className="text-xs font-medium text-on-surface">Active</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <button className="p-1 hover:bg-surface-container-highest rounded transition-colors text-on-surface-variant">
                          <span className="material-symbols-outlined">more_vert</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-outline-variant flex items-center justify-between bg-surface-container-high">
              <span className="text-xs font-label-sm text-on-surface-variant">Showing 1 to 10 of 8,432 users</span>
              <div className="flex gap-2">
                <button className="p-1 rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-variant disabled:opacity-30" disabled="">
                  <span className="material-symbols-outlined">chevron_left</span>
                </button>
                <button className="w-8 h-8 rounded-lg bg-primary text-on-primary font-bold text-xs">1</button>
                <button className="w-8 h-8 rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-variant font-bold text-xs">2</button>
                <button className="w-8 h-8 rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-variant font-bold text-xs">3</button>
                <span className="text-on-surface-variant">...</span>
                <button className="w-8 h-8 rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-variant font-bold text-xs">844</button>
                <button className="p-1 rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-variant">
                  <span className="material-symbols-outlined">chevron_right</span>
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>
      <button className="fixed bottom-8 right-8 w-14 h-14 rounded-full bg-primary text-on-primary shadow-xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all md:hidden">
        <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>person_add</span>
      </button>
    </div>
  );
};

export default UserManagement;