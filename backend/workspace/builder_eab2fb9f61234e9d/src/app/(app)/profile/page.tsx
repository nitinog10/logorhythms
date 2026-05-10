'use client';

import { useEffect, useState } from'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';

type User = {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
};

type Order = {
  id: string;
  userId: string;
  products: Array<{ id: string; name: string; price: number }>;
  total: number;
  status: string;
  createdAt: Date;
};

const ProfilePage = () => {
  const [user, setUser] = useState<User | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const userResponse = await axios.get('/api/users/1'); // Assuming user ID is 1 for demo
        setUser(userResponse.data);

        const ordersResponse = await axios.get('/api/orders?userId=1'); // Assuming user ID is 1 for demo
        setOrders(ordersResponse.data);
      } catch (err) {
        setError('Failed to load user data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserData();
  }, []);

  if (isLoading) {
    return <p>Loading...</p>;
  }

  if (error) {
    return <p>{error}</p>;
  }

  return (
    <div className="bg-background text-on-background font-body-md antialiased">
      <header className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-md">
        <nav className="flex justify-between items-center w-full px-gutter py-md max-w-container-max mx-auto">
          <div className="font-h2 text-h2 tracking-tight text-primary">GlowSkin</div>
          <div className="hidden md:flex gap-lg items-center">
            <a className="font-label-sm text-label-sm uppercase tracking-widest text-secondary hover:text-primary transition-colors" href="#">Home</a>
            <a className="font-label-sm text-label-sm uppercase tracking-widest text-secondary hover:text-primary transition-colors" href="#">Shop</a>
            <a className="font-label-sm text-label-sm uppercase tracking-widest text-secondary hover:text-primary transition-colors" href="#">Ritual</a>
            <a className="font-label-sm text-label-sm uppercase tracking-widest text-primary border-b-2 border-primary" href="#">Profile</a>
          </div>
          <div className="flex items-center gap-md">
            <button className="p-xs text-primary transition-transform duration-200 active:scale-95">
              <span className="material-symbols-outlined">settings</span>
            </button>
            <button className="p-xs text-primary transition-transform duration-200 active:scale-95">
              <span className="material-symbols-outlined">shopping_bag</span>
            </button>
          </div>
        </nav>
      </header>
      <main className="pt-xl pb-xl px-gutter max-w-container-max mx-auto min-h-screen">
        <section className="mt-lg mb-xl flex flex-col md:flex-row md:items-end justify-between gap-lg">
          <div className="flex items-center gap-lg">
            <div className="w-24 h-24 md:w-32 md:h-32 rounded-full overflow-hidden bg-surface-container-high relative">
              <img alt="Aris Thorne" className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBRXCpjCQrnirSRZBJUFk2xprY4O25BlXWVp-LxeL0N5Sm98zVH3hDo2gRyv87aQMazHPuNQB5H_wmF2WF-wu_8bVPNO0sUvhJB3rYT7PbRySPVyRxTULJf-wuFIUclqFsPpbzSqQSCcTWFqu9bDQczc85XNh5vW00uw4TLo6R0A7bTegAAFHmTPGC_41fK5p8yzIZZfxKQq9ieZpxcyrCmgXq3kwLnX_-L5YGRwfrBppyqdDIDZbXQqv5tBrkekuqYZYAMNUk0VYTb" />
            </div>
            <div>
              <h1 className="font-h1 text-h1 text-primary mb-xs">{user?.name}</h1>
              <p className="font-label-sm text-label-sm text-secondary uppercase tracking-widest">Premium Member since 2022</p>
            </div>
          </div>
          <button className="bg-primary text-on-primary px-lg py-sm rounded-xl font-label-sm text-label-sm uppercase tracking-widest transition-all duration-200 hover:opacity-90 active:scale-95">
            Edit Profile
          </button>
        </section>
        <div className="border-b border-surface-variant mb-lg overflow-x-auto">
          <div className="flex gap-lg min-w-max">
            <button className="pb-md font-label-sm text-label-sm uppercase tracking-widest border-b-2 border-primary text-primary">Order History</button>
            <button className="pb-md font-label-sm text-label-sm uppercase tracking-widest text-secondary hover:text-primary transition-colors">Favorites</button>
            <button className="pb-md font-label-sm text-label-sm uppercase tracking-widest text-secondary hover:text-primary transition-colors">Personal Information</button>
            <button className="pb-md font-label-sm text-label-sm uppercase tracking-widest text-secondary hover:text-primary transition-colors">Payment Methods</button>
          </div>
        </div>
        <section className="space-y-md">
          {orders.map((order) => (
            <div key={order.id} className="bg-surface-container-low p-lg rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-md transition-shadow hover:shadow-sm">
              <div className="grid grid-cols-2 md:flex md:gap-xl w-full md:w-auto">
                <div>
                  <p className="font-label-sm text-label-sm text-on-secondary-container uppercase mb-xs">Order Number</p>
                  <p className="font-body-lg text-body-lg text-primary font-medium">#{order.id}</p>
                </div>
                <div>
                  <p className="font-label-sm text-label-sm text-on-secondary-container uppercase mb-xs">Date</p>
                  <p className="font-body-lg text-body-lg text-primary">{new Date(order.createdAt).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="font-label-sm text-label-sm text-on-secondary-container uppercase mb-xs">Status</p>
                  <span className="inline-flex items-center gap-xs px-sm py-xs bg-tertiary-fixed text-primary rounded-full text-xs font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                    {order.status}
                  </span>
                </div>
              </div>
              <button className="border border-primary text-primary px-lg py-sm rounded-xl font-label-sm text-label-sm uppercase tracking-widest transition-all hover:bg-primary hover:text-on-primary w-full md:w-auto" onClick={() => router.push(`/orders/${order.id}`)}>
                View Details
              </button>
            </div>
          ))}
        </section>
        <section className="mt-xl">
          <h3 className="font-h3 text-h3 text-primary mb-lg">Tailored For Your Ritual</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-lg h-auto md:h-[400px]">
            <div className="md:col-span-2 bg-surface-container-high rounded-xl relative overflow-hidden group">
              <img className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" src="https://lh3.googleusercontent.com/aida-public/AB6AXuD_W-G8kGZte3GOsIoIHexhm6DuEn9MUyLvzeaC3Vuv0z58hWBQhDQ7vVlFsd8I5HE_52o6xDlR-EFZ1rwH-TE_eNENsafnR8S8XxinMtJLk8fqBLKnGUQ7T139KhTV2tJEl4fWLJclG59dr4Qz0aZVVZY3HA7OVYL14QBgKYIgaE36bvPKgGQ_o6KmhE2pqJU5nR9KdbQXo1xcM7aCjPOTh1D3hjulJEagDGTO2Hu1v7F0ckxMSJksqN-rm53fJvvgNtWiAhHzmrcO" />
              <div className="absolute inset-0 bg-gradient-to-t from-primary/60 to-transparent"></div>
              <div className="absolute bottom-0 p-lg">
                <span className="font-label-sm text-label-sm text-on-primary uppercase tracking-widest mb-sm block">Upcoming Ritual</span>
                <h4 className="font-h3 text-h3 text-on-primary">The Winter Hydration Kit</h4>
                <button className="mt-md text-on-primary border-b border-on-primary pb-xs font-label-sm text-label-sm uppercase tracking-widest">Early Access</button>
              </div>
            </div>
            <div className="bg-secondary-container rounded-xl p-lg flex flex-col justify-between">
              <div className="space-y-sm">
                <span className="material-symbols-outlined text-primary text-4xl">spa</span>
                <h4 className="font-h3 text-h3 text-primary">Your Skin Analysis</h4>
                <p className="text-on-secondary-container">Based on your recent orders, we recommend the Evening Serum.</p>
              </div>
              <button className="bg-primary text-on-primary w-full py-sm rounded-xl font-label-sm text-label-sm uppercase tracking-widest active:scale-95 transition-transform">Get Analysis</button>
            </div>
          </div>
        </section>
      </main>
      <nav className="md:hidden fixed bottom-0 left-0 w-full flex justify-around items-center py-sm px-md pb-safe bg-surface-container-low dark:bg-surface-container shadow-[0_-4px_20px_rgba(27,48,34,0.04)] z-50 rounded-t-xl">
        <a className="flex flex-col items-center justify-center text-on-secondary-container dark:text-on-tertiary-container hover:opacity-80 transition-opacity" href="#">
          <span className="material-symbols-outlined">home</span>
          <span className="font-label-sm text-label-sm uppercase tracking-widest">Home</span>
        </a>
        <a className="flex flex-col items-center justify-center text-on-secondary-container dark:text-on-tertiary-container hover:opacity-80 transition-opacity" href="#">
          <span className="material-symbols-outlined">spa</span>
          <span className="font-label-sm text-label-sm uppercase tracking-widest">Shop</span>
        </a>
        <a className="flex flex-col items-center justify-center text-on-secondary-container dark:text-on-tertiary-container hover:opacity-80 transition-opacity" href="#">
          <span className="material-symbols-outlined">self_care</span>
          <span className="font-label-sm text-label-sm uppercase tracking-widest">Ritual</span>
        </a>
        <a className="flex flex-col items-center justify-center text-primary dark:text-primary-fixed font-bold hover:opacity-80 transition-opacity" href="#">
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
          <span className="font-label-sm text-label-sm uppercase tracking-widest">Profile</span>
        </a>
      </nav>
      <div className="fixed inset-0 pointer-events-none opacity-[0.03] z-0">
        <svg height="100%" width="100%" xmlns="http://www.w3.org/2000/svg">
          <pattern height="40" id="grid" patternUnits="userSpaceOnUse" width="40">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#061b0e" strokeWidth="0.5"></path>
          </pattern>
          <rect fill="url(#grid)" height="100%" width="100%"></rect>
        </svg>
      </div>
      <style jsx global>{`
       .material-symbols-outlined {
          font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24;
        }
        body {
          background-color: #fbf9f5;
        }
      `}</style>
    </div>
  );
};

export default ProfilePage;