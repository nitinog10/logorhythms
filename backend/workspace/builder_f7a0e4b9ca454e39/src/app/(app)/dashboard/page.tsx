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
  rating: number;
};

type FAQ = {
  id: string;
  question: string;
  answer: string;
};

const HomePage = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [email, setEmail] = useState('');
  const router = useRouter();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const usersResponse = await axios.get('/api/users');
        const plansResponse = await axios.get('/api/plans');
        const testimonialsResponse = await axios.get('/api/testimonials');
        const faqsResponse = await axios.get('/api/faqs');

        setUsers(usersResponse.data);
        setPlans(plansResponse.data);
        setTestimonials(testimonialsResponse.data);
        setFaqs(faqsResponse.data);
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
      alert('Sign up successful!');
      router.push('/dashboard');
    } catch (error) {
      console.error('Error signing up:', error);
      alert('Sign up failed. Please try again.');
    }
  };

  return (
    <div className="bg-surface font-body-md text-on-surface selection:bg-primary-fixed selection:text-on-primary-fixed">
      <nav className="fixed top-0 w-full z-50 flex justify-between items-center h-20 px-margin max-w-container-max mx-auto bg-surface/80 backdrop-blur-md shadow-sm">
        <div className="flex items-center gap-stack-lg">
          <span className="font-h3 text-h3 font-bold text-primary">SaaSFlow</span>
          <div className="hidden md:flex items-center gap-gutter">
            <a className="font-body-md text-body-md text-primary font-bold border-b-2 border-primary pb-1" href="#">Features</a>
            <a className="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors" href="#">Pricing</a>
            <a className="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors" href="#">About</a>
            <a className="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors" href="#">Blog</a>
          </div>
        </div>
        <div className="flex items-center gap-stack-sm">
          <button className="px-6 py-2.5 rounded-lg font-label-sm text-label-sm text-primary hover:opacity-90 transition-opacity">Login</button>
          <button className="px-6 py-2.5 rounded-lg font-label-sm text-label-sm accent-gradient text-on-primary hover:opacity-90 transition-opacity shadow-lg shadow-primary/20">Sign Up</button>
        </div>
      </nav>
      <main className="pt-20">
        <section className="hero-gradient pt-stack-lg pb-0 overflow-hidden">
          <div className="max-w-container-max mx-auto px-margin text-center">
            <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-primary-fixed text-on-primary-fixed font-label-sm text-label-sm mb-stack-md">
              <span className="mr-2">✨</span> New: AI-Powered Workflow Automations
            </div>
            <h1 className="font-h1 text-h1 max-w-4xl mx-auto mb-stack-md">Streamline Your Workflow with <span className="text-primary">SaaSFlow</span></h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl mx-auto mb-stack-lg">
              The all-in-one platform for modern teams to manage projects, automate redundant tasks, and scale operations with technical elegance.
            </p>
            <form className="max-w-lg mx-auto flex flex-col sm:flex-row gap-base mb-stack-lg" onSubmit={handleSubmit}>
              <input
                className="flex-grow h-14 px-6 rounded-xl bg-surface-container-lowest border-outline-variant focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-body-md"
                placeholder="Enter your work email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button
                className="h-14 px-8 rounded-xl accent-gradient text-on-primary font-h3 text-body-md font-bold hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-primary/25 whitespace-nowrap"
                type="submit"
              >
                Get Started
              </button>
            </form>
            <div className="relative mt-stack-lg">
              <div className="absolute inset-0 bg-gradient-to-t from-surface to-transparent z-10 h-32 bottom-0 top-auto"></div>
              <img
                className="w-full max-w-5xl mx-auto rounded-t-2xl shadow-2xl border border-outline-variant/30 glass-card"
                data-alt="A high-fidelity software dashboard interface displayed on a clean, modern computer screen. The UI features sleek data visualizations, colorful line charts, and a sidebar navigation in a light-mode aesthetic. The composition is clean and centered with soft studio lighting reflecting off the glass screen, set against a minimal white background that highlights the professional SaaS design."
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCyWNoaCemg2yTxzyo8DDIQUBPq_nSacR1A3vMA6JmMuD6K2LWU5BZ5wt01ipX26qMH-E_IhlA76sMQ5P-QvfH7HtoliC-1qDocUczFPiEx0WZ0h5QGysWoaX6wIMlwstaKbexBjJFt4mjtvMZTUmHXoiFVi7QCoPhurS6MVHqDNasGFN57GZfXhE6TJUb9xVjZPX4H793Fs-lrqPSKSDEVQD_B_yocLhkFTmS32OrWK9xeOtedYMdFOjSq3g0Dtuwdhf7Vc911iZ4"
              />
            </div>
          </div>
        </section>
        <section className="py-stack-lg bg-surface-container-low">
          <div className="max-w-container-max mx-auto px-margin">
            <p className="text-center font-label-sm text-label-sm text-outline mb-stack-md">TRUSTED BY INNOVATIVE TEAMS WORLDWIDE</p>
            <div className="flex flex-wrap justify-center items-center gap-x-16 gap-y-8 opacity-60">
              <span className="font-h3 text-h3 font-bold text-tertiary">TechCorp</span>
              <span className="font-h3 text-h3 font-bold text-tertiary">CloudNine</span>
              <span className="font-h3 text-h3 font-bold text-tertiary">DataStream</span>
              <span className="font-h3 text-h3 font-bold text-tertiary">NovaSoft</span>
              <span className="font-h3 text-h3 font-bold text-tertiary">PulseAI</span>
              <span className="font-h3 text-h3 font-bold text-tertiary">Zenith</span>
            </div>
          </div>
        </section>
        <section className="py-stack-lg">
          <div className="max-w-container-max mx-auto px-margin">
            <div className="text-center mb-stack-lg">
              <h2 className="font-h2 text-h2 mb-base">Why Choose Us</h2>
              <p className="text-on-surface-variant max-w-xl mx-auto">Powerful features designed to help your team perform at its peak without the complexity.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
              <div className="p-stack-lg rounded-xl bg-surface-container-lowest border border-outline-variant/30 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                <div className="w-12 h-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-stack-md">
                  <span className="material-symbols-outlined" data-icon="rocket_launch">rocket_launch</span>
                </div>
                <h3 className="font-h3 text-h3 mb-base">Rapid Deployment</h3>
                <p className="text-on-surface-variant">Get up and running in minutes with our intuitive onboarding flow and pre-built workflow templates.</p>
              </div>
              <div className="p-stack-lg rounded-xl bg-surface-container-lowest border border-outline-variant/30 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                <div className="w-12 h-12 rounded-lg bg-secondary/10 text-secondary flex items-center justify-center mb-stack-md">
                  <span className="material-symbols-outlined" data-icon="shield">shield</span>
                </div>
                <h3 className="font-h3 text-h3 mb-base">Enterprise Security</h3>
                <p className="text-on-surface-variant">Bank-grade encryption and SOC2 compliance come standard, ensuring your sensitive data remains private.</p>
              </div>
              <div className="p-stack-lg rounded-xl bg-surface-container-lowest border border-outline-variant/30 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                <div className="w-12 h-12 rounded-lg bg-tertiary-container/10 text-tertiary flex items-center justify-center mb-stack-md">
                  <span className="material-symbols-outlined" data-icon="insights">insights</span>
                </div>
                <h3 className="font-h3 text-h3 mb-base">Advanced Analytics</h3>
                <p className="text-on-surface-variant">Gain deep insights into team performance and project bottlenecks with real-time data visualization.</p>
              </div>
            </div>
          </div>
        </section>
        <section className="py-stack-lg bg-inverse-surface text-on-primary-container overflow-hidden">
          <div className="max-w-container-max mx-auto px-margin">
            <div className="text-center mb-stack-lg">
              <h2 className="font-h2 text-h2 text-surface mb-base">Experience the Power</h2>
              <p className="text-surface-variant max-w-xl mx-auto">A unified interface that brings together all your tools and data points into a single source of truth.</p>
            </div>
            <div className="relative">
              <div className="rounded-xl overflow-hidden shadow-2xl border border-outline/30">
                <img
                  className="w-full"
                  data-alt="A sophisticated web application interface shown from a slightly elevated perspective. The screen displays complex data grids, interactive Gantt charts, and user collaboration modules. The visual style is premium with a dark-mode sidebar contrasting against a clean, spacious light-mode content area. Dynamic blue and purple accents guide the eye toward key performance metrics and action buttons."
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuDDDrW6ExU0T06_Ldrm1Vn0Upx7clda2zyHs7FI4Zfjw_AhczP_FJzewhHa1p4phWiDdGBBGwMTZNcF8pntMv5pa_1k-jYuHhWL5xlm-D_jh6G1fXP7JMo4EHgRP8VmUyuFN1ykMFCCwgW0K2j4Xw7gMy_5lmwzu0JJWbcJVDps_PptysOgmyq327nDls_6O_S7y0tuQ9pkClTJEZDDc0rjzaHtHwz4D3qtxsLzIsTh6MW18jrdFEXq8Msd0916FkUcokkfawLkeAI"
                />
              </div>
              <div className="hidden lg:block absolute top-1/4 -left-8 floating-badge glass-card px-6 py-4 rounded-xl border-l-4 border-primary">
                <div className="flex items-center gap-base">
                  <span className="material-symbols-outlined text-primary" data-icon="bolt">bolt</span>
                  <div>
                    <p className="font-bold text-on-surface">Real-time Analytics</p>
                    <p className="text-label-sm text-on-surface-variant">Syncing every 2 seconds</p>
                  </div>
                </div>
              </div>
              <div className="hidden lg:block absolute bottom-1/3 -right-12 floating-badge glass-card px-6 py-4 rounded-xl border-l-4 border-secondary">
                <div className="flex items-center gap-base">
                  <span className="material-symbols-outlined text-secondary" data-icon="lock">lock</span>
                  <div>
                    <p className="font-bold text-on-surface">Secure Storage</p>
                    <p className="text-label-sm text-on-surface-variant">AES-256 Encrypted</p>
                  </div>
                </div>
              </div>
              <div className="hidden lg:block absolute -bottom-8 left-1/3 floating-badge glass-card px-6 py-4 rounded-xl border-l-4 border-tertiary-container">
                <div className="flex items-center gap-base">
                  <span className="material-symbols-outlined text-tertiary" data-icon="auto_awesome">auto_awesome</span>
                  <div>
                    <p className="font-bold text-on-surface">Smart Automations</p>
                    <p className="text-label-sm text-on-surface-variant">AI-driven task routing</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="w-full py-stack-lg px-margin flex flex-col md:flex-row justify-between items-center gap-base bg-surface-container-lowest border-t border-outline-variant">
        <div className="flex flex-col gap-base items-center md:items-start">
          <span className="font-h3 text-h3 font-bold text-primary">SaaSFlow</span>
          <p className="font-label-sm text-label-sm text-on-surface-variant">© 2024 SaaSFlow Inc. All rights reserved.</p>
        </div>
        <div className="flex flex-wrap justify-center gap-gutter">
          <a className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary transition-all" href="#">Privacy Policy</a>
          <a className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary transition-all" href="#">Terms of Service</a>
          <a className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary transition-all" href="#">Cookie Policy</a>
          <a className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary transition-all" href="#">Contact Us</a>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;