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

type Subscription = {
  id: string;
  userId: string;
  plan: 'starter' | 'pro' | 'enterprise';
  billingCycle: 'monthly' | 'yearly';
  createdAt: Date;
};

const UserManagement = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('All Status');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'create' | 'edit' | null>(null);
  const [formData, setFormData] = useState<Partial<User>>({});
  const router = useRouter();

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoading(true);
        const response = await axios.get('/api/users');
        setUsers(response.data);
      } catch (err) {
        setError('Failed to load users');
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, []);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilterStatus(e.target.value);
  };

  const handleCheckboxChange = (userId: string) => {
    setSelectedUsers((prev) =>
      prev.includes(userId)? prev.filter((id) => id!== userId) : [...prev, userId]
    );
  };

  const handleInviteUser = () => {
    setIsModalOpen(true);
    setModalType('create');
    setFormData({});
  };

  const handleEditUser = (user: User) => {
    setIsModalOpen(true);
    setModalType('edit');
    setFormData(user);
  };

  const handleDeleteUser = async (userId: string) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      try {
        await axios.delete(`/api/users/${userId}`);
        setUsers(users.filter((user) => user.id!== userId));
      } catch (err) {
        setError('Failed to delete user');
      }
    }
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setModalType(null);
    setFormData({});
  };

  const handleModalSubmit = async () => {
    try {
      if (modalType === 'create') {
        await axios.post('/api/users', formData);
      } else if (modalType === 'edit' && formData.id) {
        await axios.put(`/api/users/${formData.id}`, formData);
      }
      setIsModalOpen(false);
      setModalType(null);
      setFormData({});
      router.refresh();
    } catch (err) {
      setError('Failed to save user');
    }
  };

  const filteredUsers = users.filter((user) => {
    if (searchQuery &&!user.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    if (filterStatus!== 'All Status' && user.status!== filterStatus.toLowerCase()) {
      return false;
    }
    return true;
  });

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="ml-64 min-h-screen flex flex-col">
      <header className="bg-surface/70 backdrop-blur-md dark:bg-surface-container/70 w-full h-16 sticky top-0 border-b border-outline-variant/30 shadow-sm flex justify-between items-center px-container-padding z-40">
        <div className="flex items-center gap-6">
          <div className="relative group">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-xl">search</span>
            <input
              className="bg-surface-container-lowest border-outline-variant/30 border rounded-full pl-10 pr-4 py-1.5 text-body-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all w-64 md:w-80"
              placeholder="Global search..."
              type="text"
              value={searchQuery}
              onChange={handleSearch}
            />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button className="p-2 text-on-surface-variant hover:text-primary transition-colors active:scale-95 duration-200">
            <span className="material-symbols-outlined">notifications</span>
          </button>
          <button className="p-2 text-on-surface-variant hover:text-primary transition-colors active:scale-95 duration-200">
            <span className="material-symbols-outlined">settings</span>
          </button>
          <div className="h-8 w-px bg-outline-variant/30 mx-2"></div>
          <div className="flex items-center gap-3 cursor-pointer group">
            <div className="text-right hidden sm:block">
              <p className="text-body-sm font-bold text-on-surface leading-none">Alex Rivera</p>
              <p className="text-[10px] text-on-surface-variant font-label-caps tracking-tighter">Admin Access</p>
            </div>
            <img
              alt="User profile avatar"
              className="w-8 h-8 rounded-full border border-primary/20 group-hover:border-primary/50 transition-colors"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuC5qUB972UFMbUWAfKrWsGwehX1EQM2hqoxfLa0oKPvZ_noRtK9lOeWIBCxDyyClLHGBq2SWue-dokG0UBvLh29JeGxxSjkEHrWsWIVQZ7mT__LYWr5ar6I99j-ksv54zY8U0guZIgyNd8Fuz_doowKH-a4WYu7QS-Mo8DNgR9U8_s4ztExWFLCK3Ye2BxS-MPY1ddvMQ7wUyfUaoav6LmR7HLnVTJ7bmreNMl0jd1Y8pgXPwQ7-qKvCtsQfZ8NTTehn19HfyVLjD0"
            />
          </div>
        </div>
      </header>
      <main className="p-container-padding space-y-section-gap">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="font-display-lg text-display-lg text-on-surface tracking-tight">User Management</h2>
            <p className="text-on-surface-variant mt-1">Review, monitor, and manage access for all organization members.</p>
          </div>
          <div className="flex gap-3">
            <button className="px-4 py-2 bg-surface-container-high border border-outline-variant/30 rounded-lg font-label-caps text-label-caps text-on-surface hover:bg-surface-variant transition-colors flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">download</span>
              Export List
            </button>
            <button className="px-6 py-2 bg-primary text-on-primary rounded-lg font-label-caps text-label-caps shadow-lg shadow-primary/20 hover:opacity-90 active:scale-95 transition-all flex items-center gap-2" onClick={handleInviteUser}>
              <span className="material-symbols-outlined text-sm">person_add</span>
              Invite User
            </button>
          </div>
        </div>
        <div className="glass-card rounded-2xl border border-outline-variant/20 overflow-hidden">
          <div className="p-4 border-b border-outline-variant/20 bg-surface-container/30 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4 flex-1 min-w-[300px]">
              <div className="relative flex-1">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
                <input
                  className="w-full bg-surface-container-lowest border-outline-variant/30 border rounded-lg pl-10 pr-4 py-2 text-body-sm focus:border-primary outline-none transition-all"
                  placeholder="Search by name, email, or ID..."
                  type="text"
                  value={searchQuery}
                  onChange={handleSearch}
                />
              </div>
              <div className="relative min-w-[140px]">
                <select
                  className="w-full appearance-none bg-surface-container-lowest border-outline-variant/30 border rounded-lg px-3 py-2 text-body-sm pr-8 focus:border-primary outline-none"
                  value={filterStatus}
                  onChange={handleFilterChange}
                >
                  <option>All Status</option>
                  <option>Active</option>
                  <option>Trial</option>
                  <option>Churned</option>
                  <option>Suspended</option>
                </select>
                <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">expand_more</span>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-surface-container-high/50 p-1.5 rounded-lg border border-outline-variant/20">
              <span className="text-[10px] font-label-caps text-on-surface-variant px-2">BULK ACTIONS</span>
              <button className="p-1.5 hover:bg-surface-variant rounded text-on-surface-variant hover:text-on-surface transition-colors" title="Export Selected">
                <span className="material-symbols-outlined text-xl">file_download</span>
              </button>
              <button className="p-1.5 hover:bg-surface-variant rounded text-on-surface-variant hover:text-primary transition-colors" title="Change Plan">
                <span className="material-symbols-outlined text-xl">upgrade</span>
              </button>
              <button className="p-1.5 hover:bg-surface-variant rounded text-on-surface-variant hover:text-error transition-colors" title="Delete Selected">
                <span className="material-symbols-outlined text-xl">delete</span>
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-high/30">
                  <th className="p-4 border-b border-outline-variant/20 w-12">
                    <input
                      className="rounded border-outline-variant bg-surface-container-lowest text-primary focus:ring-primary"
                      type="checkbox"
                      checked={selectedUsers.length === users.length}
                      onChange={() => setSelectedUsers(users.map((user) => user.id))}
                    />
                  </th>
                  <th className="p-4 border-b border-outline-variant/20 font-label-caps text-label-caps text-on-surface-variant">USER</th>
                  <th className="p-4 border-b border-outline-variant/20 font-label-caps text-label-caps text-on-surface-variant">PLAN</th>
                  <th className="p-4 border-b border-outline-variant/20 font-label-caps text-label-caps text-on-surface-variant">MRR CONTRIBUTION</th>
                  <th className="p-4 border-b border-outline-variant/20 font-label-caps text-label-caps text-on-surface-variant">LAST ACTIVE</th>
                  <th className="p-4 border-b border-outline-variant/20 font-label-caps text-label-caps text-on-surface-variant">STATUS</th>
                  <th className="p-4 border-b border-outline-variant/20 font-label-caps text-label-caps text-on-surface-variant text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-surface-container-highest/20 transition-colors group">
                    <td className="p-4">
                      <input
                        className="rounded border-outline-variant bg-surface-container-lowest text-primary focus:ring-primary"
                        type="checkbox"
                        checked={selectedUsers.includes(user.id)}
                        onChange={() => handleCheckboxChange(user.id)}
                      />
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <img alt="User avatar" className="w-10 h-10 rounded-full border border-outline-variant/30" src={`https://lh3.googleusercontent.com/aida-public/AB6AXuC5qUB972UFMbUWAfKrWsGwehX1EQM2hqoxfLa0oKPvZ_noRtK9lOeWIBCxDyyClLHGBq2SWue-dokG0UBvLh29JeGxxSjkEHrWsWIVQZ7mT__LYWr5ar6I99j-ksv54zY8U0guZIgyNd8Fuz_doowKH-a4WYu7QS-Mo8DNgR9U8_s4ztExWFLCK3Ye2BxS-MPY1ddvMQ7wUyfUaoav6LmR7HLnVTJ7bmreNMl0jd1Y8pgXPwQ7-qKvCtsQfZ8NTTehn19HfyVLjD0`} />
                          <div className="absolute bottom-0 right-0 w-3 h-3 bg-primary border-2 border-surface-container rounded-full"></div>
                        </div>
                        <div>
                          <p className="text-body-sm font-bold text-on-surface">{user.name}</p>
                          <p className="text-body-sm text-on-surface-variant">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="px-2 py-1 bg-primary/10 text-primary border border-primary/20 rounded-md text-[10px] font-bold tracking-tight uppercase">Enterprise</span>
                    </td>
                    <td className="p-4 font-data-mono text-on-surface">$499.00</td>
                    <td className="p-4 text-body-sm text-on-surface-variant">2 hours ago</td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                        <span className="text-body-sm text-on-surface">Active</span>
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <button className="p-2 text-on-surface-variant hover:text-on-surface transition-colors" onClick={() => handleEditUser(user)}>
                        <span className="material-symbols-outlined">more_vert</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-4 border-t border-outline-variant/20 bg-surface-container/20 flex items-center justify-between">
            <p className="text-body-sm text-on-surface-variant">Showing <span className="text-on-surface font-bold">1-10</span> of 14,204 users</p>
            <div className="flex items-center gap-2">
              <button className="p-1.5 rounded border border-outline-variant/30 text-on-surface-variant hover:bg-surface-variant transition-colors disabled:opacity-30" disabled>
                <span className="material-symbols-outlined">chevron_left</span>
              </button>
              <div className="flex items-center gap-1">
                <button className="w-8 h-8 rounded bg-primary text-on-primary font-bold text-xs">1</button>
                <button className="w-8 h-8 rounded hover:bg-surface-variant text-on-surface-variant text-xs">2</button>
                <button className="w-8 h-8 rounded hover:bg-surface-variant text-on-surface-variant text-xs">3</button>
                <span className="text-on-surface-variant px-1">...</span>
                <button className="w-8 h-8 rounded hover:bg-surface-variant text-on-surface-variant text-xs">142</button>
              </div>
              <button className="p-1.5 rounded border border-outline-variant/30 text-on-surface-variant hover:bg-surface-variant transition-colors">
                <span className="material-symbols-outlined">chevron_right</span>
              </button>
            </div>
          </div>
        </div>
      </main>
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-surface-container p-6 rounded-lg">
            <h3 className="text-on-surface font-bold mb-4">{modalType === 'create'? 'Invite User' : 'Edit User'}</h3>
            <form onSubmit={(e) => { e.preventDefault(); handleModalSubmit(); }}>
              <div className="mb-4">
                <label className="block text-on-surface-variant mb-2" htmlFor="name">Name</label>
                <input
                  className="w-full p-2 border border-outline-variant rounded"
                  type="text"
                  id="name"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({...formData, name: e.target.value })}
                />
              </div>
              <div className="mb-4">
                <label className="block text-on-surface-variant mb-2" htmlFor="email">Email</label>
                <input
                  className="w-full p-2 border border-outline-variant rounded"
                  type="email"
                  id="email"
                  value={formData.email || ''}
                  onChange={(e) => setFormData({...formData, email: e.target.value })}
                />
              </div>
              <div className="mb-4">
                <label className="block text-on-surface-variant mb-2" htmlFor="status">Status</label>
                <select
                  className="w-full p-2 border border-outline-variant rounded"
                  id="status"
                  value={formData.status || ''}
                  onChange={(e) => setFormData({...formData, status: e.target.value as 'active' | 'trial' | 'churned' | 'suspended' })}
                >
                  <option value="active">Active</option>
                  <option value="trial">Trial</option>
                  <option value="churned">Churned</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>
              <div className="flex justify-end">
                <button
                  className="px-4 py-2 bg-primary text-on-primary rounded mr-2"
                  type="submit"
                >
                  {modalType === 'create'? 'Invite' : 'Save'}
                </button>
                <button
                  className="px-4 py-2 bg-surface-container-high text-on-surface rounded"
                  type="button"
                  onClick={handleModalClose}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;