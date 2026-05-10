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

type Plan = {
  id: string;
  name: string;
  price: number;
  features: string[];
};

type Testimonial = {
  id: string;
  author: string;
  company: string;
  content: string;
};

const LandingPage = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [email, setEmail] = useState('');
  const router = useRouter();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const usersResponse = await axios.get('/api/users');
        const plansResponse = await axios.get('/api/plans');
        const testimonialsResponse = await axios.get('/api/testimonials');
        setUsers(usersResponse.data);
        setPlans(plansResponse.data);
        setTestimonials(testimonialsResponse.data);
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };

    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post('/api/users', { email });
      setEmail('');
      router.push('/success');
    } catch (error) {
      console.error('Error submitting form:', error);
    }
  };

  return (
    <div className="bg-surface font-body-md text-on-surface selection:bg-primary-fixed-dim selection:text-on-primary-fixed min-h-screen mesh-gradient">
      <nav className="sticky top-0 w-full z-50 bg-surface/70 backdrop-blur-xl border-b border-outline-variant/10 shadow-sm">
        <div className="flex items-center justify-between px-margin-page py-4 max-w-container-max mx-auto">
          <div className="flex items-center gap-stack-lg">
            <span className="font-headline-md text-headline-md text-primary tracking-tight font-extrabold">Luminous</span>
            <div className="hidden md:flex gap-6 items-center">
              <a className="font-body-md text-body-md text-primary font-bold border-b-2 border-primary" href="#">Features</a>
              <a className="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors" href="#">Pricing</a>
              <a className="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors" href="#">About</a>
              <a className="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors" href="#">Blog</a>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button className="font-body-md text-body-md text-on-surface-variant hover:opacity-80 active:scale-95 transition-all px-4 py-2">Login</button>
            <button className="font-body-md text-body-md bg-primary text-on-primary px-6 py-2.5 rounded-xl shadow-lg hover:shadow-primary/20 active:scale-95 transition-all font-semibold">Sign Up</button>
          </div>
        </div>
      </nav>
      <header className="relative px-margin-page py-stack-lg pt-20 overflow-hidden">
        <div className="max-w-container-max mx-auto flex flex-col items-center text-center gap-stack-md relative z-10">
          <span className="px-4 py-1.5 rounded-full bg-primary text-on-primary-fixed-variant font-label-sm text-label-sm uppercase tracking-widest shadow-sm">New: AI Workflows 2.0</span>
          <h1 className="font-display-xl text-display-xl text-on-background max-w-4xl text-balance">
            Illuminate Your Workflow with <span className="text-primary">Mickey</span>
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl text-balance">
            The all-in-one platform to automate your business processes and scale faster. Stop the busywork and start the growth work.
          </p>
          <form onSubmit={handleSubmit} className="w-full max-w-md mt-4 flex flex-col sm:flex-row gap-2 p-1.5 rounded-2xl bg-surface-container-low shadow-sm border border-outline-variant/10">
            <input
              className="flex-grow bg-transparent border-none focus:ring-0 px-4 font-body-md text-body-md text-on-surface"
              placeholder="Enter your work email"
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="bg-primary text-on-primary px-8 py-3 rounded-xl font-semibold hover:opacity-90 active:scale-95 transition-all shadow-md">Get Started</button>
          </form>
          <div className="mt-16 relative w-full max-w-5xl group">
            <div className="absolute -inset-1 bg-gradient-to-r from-primary to-secondary rounded-2xl blur opacity-20 group-hover:opacity-30 transition duration-1000"></div>
            <div className="relative glass-card rounded-xl overflow-hidden border border-white/20 p-2">
              <img
                alt="Mickey Dashboard Mockup"
                className="w-full h-auto rounded-lg shadow-2xl"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuB9VMegmJvGuUOiWbdFIcL1gbWjYUNEIhHCrPQwkDizBX3gV6N-r_3qvjc0gdIlOsrS93SCCr_IasnIkTR4DObbgr2SkXQFiMRkQnF_hFZIREW6UKhPGGGYf__MkClR--cwDud7ZO_gBzlXMXwwhHHg-kc8kDn4_iJCGjR3boyobJ36TCa38GmMpeZ4LFuhKNrxr3Iy5X9sqCrm8xR0S_dQ-zSSdrHz1pHw-NLphBdjMpHXWhIS74a2907iAmKb8erKts0OGAMwiqI"
              />
            </div>
          </div>
        </div>
      </header>
      <section className="py-stack-lg border-y border-outline-variant/10 bg-white/30 backdrop-blur-sm">
        <div className="max-w-container-max mx-auto px-margin-page">
          <p className="text-center font-label-sm text-label-sm text-outline uppercase tracking-widest mb-10">Trusted by modern engineering teams</p>
          <div className="flex flex-wrap justify-center items-center gap-12 md:gap-20 opacity-60 grayscale transition-all hover:grayscale-0">
            <span className="font-headline-md text-on-surface-variant font-bold tracking-tighter">TechFlow</span>
            <span className="font-headline-md text-on-surface-variant font-bold tracking-tighter italic">CloudNine</span>
            <span className="font-headline-md text-on-surface-variant font-bold tracking-tighter">DataStream</span>
            <span className="font-headline-md text-on-surface-variant font-bold tracking-tighter">ZENITH</span>
            <span className="font-headline-md text-on-surface-variant font-bold tracking-tighter">NOVA</span>
          </div>
        </div>
      </section>
      <section className="py-stack-lg px-margin-page">
        <div className="max-w-container-max mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-headline-lg text-headline-lg text-on-background mb-4">Precision-engineered for scale</h2>
            <p className="font-body-md text-body-md text-on-surface-variant">Tools designed to handle the complexity of your growing infrastructure.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
            <div className="glass-card p-8 rounded-xl flex flex-col gap-4 group hover:translate-y-[-4px] transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-secondary-container flex items-center justify-center text-on-secondary-container shadow-inner">
                <span className="material-symbols-outlined" data-weight="fill">auto_awesome</span>
              </div>
              <h3 className="font-headline-md text-headline-md text-on-background">Smart Automation</h3>
              <p className="font-body-md text-body-md text-on-surface-variant">AI-driven workflows that learn from your processes and suggest optimizations in real-time.</p>
            </div>
            <div className="glass-card p-8 rounded-xl flex flex-col gap-4 group hover:translate-y-[-4px] transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-primary-container flex items-center justify-center text-on-primary-container shadow-inner">
                <span className="material-symbols-outlined" data-weight="fill">analytics</span>
              </div>
              <h3 className="font-headline-md text-headline-md text-on-background">Real-time Analytics</h3>
              <p className="font-body-md text-body-md text-on-surface-variant">Get data at your fingertips with ultra-fast querying and beautiful, interactive visualizations.</p>
            </div>
            <div className="glass-card p-8 rounded-xl flex flex-col gap-4 group hover:translate-y-[-4px] transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-tertiary-container flex items-center justify-center text-on-tertiary-container shadow-inner">
                <span className="material-symbols-outlined" data-weight="fill">language</span>
              </div>
              <h3 className="font-headline-md text-headline-md text-on-background">Global Scale</h3>
              <p className="font-body-md text-body-md text-on-surface-variant">Distributed infrastructure that grows with you, ensuring low latency and high availability worldwide.</p>
            </div>
          </div>
        </div>
      </section>
      <section className="py-stack-lg px-margin-page bg-on-background overflow-hidden">
        <div className="max-w-container-max mx-auto relative py-20">
          <div className="text-center mb-20">
            <h2 className="font-display-xl text-display-xl text-white mb-6">Built for the next billion</h2>
            <p className="font-body-lg text-body-lg text-surface-variant max-w-2xl mx-auto">See how Mickey transforms complex operational data into actionable insights with our flagship interface.</p>
          </div>
          <div className="relative max-w-4xl mx-auto">
            <div className="absolute -top-10 -left-10 z-20 glass-card bg-white/10 border-white/20 p-4 rounded-xl flex items-center gap-3 backdrop-blur-md">
              <div className="w-2 h-2 rounded-full bg-tertiary-fixed-dim animate-pulse"></div>
              <p className="text-white font-label-sm text-label-sm">Live System Monitoring</p>
            </div>
            <div className="absolute top-1/2 -right-16 z-20 glass-card bg-white/10 border-white/20 p-4 rounded-xl flex items-center gap-3 backdrop-blur-md">
              <span className="material-symbols-outlined text-primary-fixed-dim">speed</span>
              <p className="text-white font-label-sm text-label-sm">Sub-ms Latency</p>
            </div>
            <div className="absolute -bottom-6 left-1/4 z-20 glass-card bg-white/10 border-white/20 p-4 rounded-xl flex items-center gap-3 backdrop-blur-md">
              <span className="material-symbols-outlined text-secondary-fixed-dim">security</span>
              <p className="text-white font-label-sm text-label-sm">Enterprise Encryption</p>
            </div>
            <div className="rounded-2xl overflow-hidden shadow-2xl border border-white/10">
              <img
                alt="Product Interface Details"
                className="w-full h-auto"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCENtXRfKfmsCiENmVl2-8XLjBQ_UHyBzKj2kOMoBEtOXElYWDJRAO6tfFPhnOs-RL_mlr7Qpel9oce9oAP5BmU0Yfw7896b5BeQa97zSx7xoiC-uYRMBfaDpTmGKefPBLRiO2_ZP8qU3kJ68rhhks13n6zfmBRRo3Xeva7jfaPVpO7yWHOE_HWHTIMZpGytBVXUdUb_-wVhf3Lgmz1bDQo6ZmmT2rHkWvAVJ-TPHggHLWL2UMQRKDngOmpTrg8cSMwLp6BkaSv7TE"
              />
            </div>
            <div className="absolute -inset-40 bg-primary/20 blur-[120px] rounded-full -z-10 opacity-50"></div>
          </div>
        </div>
      </section>
      <footer className="bg-surface-container-lowest border-t border-outline-variant/10">
        <div className="flex flex-col md:flex-row justify-between items-center px-margin-page py-stack-md gap-4 max-w-container-max mx-auto">
          <div className="flex items-center gap-4">
            <span className="font-headline-md text-headline-md text-primary font-bold">Mickey</span>
            <span className="font-body-md text-body-md text-on-surface-variant">© 2024 Mickey SaaS. All rights reserved.</span>
          </div>
          <div className="flex gap-8 items-center">
            <a className="font-body-md text-body-md text-on-surface-variant hover:text-secondary cursor-pointer transition-colors" href="#">Privacy Policy</a>
            <a className="font-body-md text-body-md text-on-surface-variant hover:text-secondary cursor-pointer transition-colors" href="#">Terms of Service</a>
            <a className="font-body-md text-body-md text-on-surface-variant hover:text-secondary cursor-pointer transition-colors" href="#">Security</a>
            <a className="font-body-md text-body-md text-on-surface-variant hover:text-secondary cursor-pointer transition-colors" href="#">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;