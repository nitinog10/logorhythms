'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';

type Testimonial = {
  id: string;
  author: string;
  company: string;
  content: string;
  rating: number;
};

const TestimonialsPage = () => {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTestimonials = async () => {
      try {
        const response = await axios.get('/api/testimonials');
        setTestimonials(response.data);
        setLoading(false);
      } catch (err) {
        setError('Failed to load testimonials');
        setLoading(false);
      }
    };

    fetchTestimonials();
  }, []);

  if (loading) return <p>Loading...</p>;
  if (error) return <p>{error}</p>;

  return (
    <div className="bg-background text-on-background font-body-md antialiased">
      <nav className="bg-surface/80 dark:bg-surface-container-low/80 backdrop-blur-md fixed top-0 w-full z-50 border-b border-outline-variant/30 dark:border-outline-variant/10 shadow-sm dark:shadow-none">
        <div className="flex justify-between items-center max-w-container-max mx-auto px-margin py-base w-full">
          <div className="font-h3 text-h3 font-bold text-primary dark:text-primary-fixed-dim tracking-tight">SaaSFlow</div>
          <div className="hidden md:flex items-center gap-gutter">
            <a className="font-label-sm text-label-sm text-on-surface-variant dark:text-surface-variant hover:text-primary dark:hover:text-primary-fixed transition-colors" href="#">Features</a>
            <a className="font-label-sm text-label-sm text-primary dark:text-primary-fixed border-b-2 border-primary dark:border-primary-fixed pb-1" href="#">Testimonials</a>
            <a className="font-label-sm text-label-sm text-on-surface-variant dark:text-surface-variant hover:text-primary dark:hover:text-primary-fixed transition-colors" href="#">Pricing</a>
            <a className="font-label-sm text-label-sm text-on-surface-variant dark:text-surface-variant hover:text-primary dark:hover:text-primary-fixed transition-colors" href="#">Enterprise</a>
          </div>
          <div className="flex items-center gap-base">
            <button className="font-label-sm text-label-sm px-4 py-2 text-on-surface-variant hover:bg-surface-container-high/50 rounded-lg transition-all">Log In</button>
            <button className="font-label-sm text-label-sm px-6 py-2 bg-primary text-on-primary rounded-full active:scale-95 transform transition-transform duration-200 shadow-lg shadow-primary/20">Get Started</button>
          </div>
        </div>
      </nav>
      <main className="w-full pt-20">
        <section className="py-stack-lg px-margin max-w-container-max mx-auto">
          <div className="text-center mb-stack-lg">
            <span className="inline-block px-4 py-1.5 mb-stack-sm rounded-full bg-primary-container/10 text-primary font-label-sm text-label-sm uppercase tracking-widest">Global Trust</span>
            <h1 className="font-h1 text-h1 text-on-surface max-w-3xl mx-auto">Loved by teams worldwide</h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant mt-stack-sm max-w-2xl mx-auto">Join thousands of high-velocity organizations scaling their operations with technical elegance and precision.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
            {testimonials.map((testimonial) => (
              <div key={testimonial.id} className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-8 testimonial-card-shadow flex flex-col h-full transition-all hover:-translate-y-1">
                <div className="flex gap-0.5 text-primary mb-stack-sm">
                  {[...Array(5)].map((_, index) => (
                    <span key={index} className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                  ))}
                </div>
                <blockquote className="font-body-lg text-body-lg text-on-surface italic mb-stack-md flex-grow">
                  {testimonial.content}
                </blockquote>
                <div className="flex items-center gap-4 border-t border-outline-variant/20 pt-stack-md">
                  <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-primary-fixed">
                    <img className="w-full h-full object-cover" src={`https://lh3.googleusercontent.com/aida-public/AB6AXuAjqkq_i-jpBxb812vm50i96T1GVkT2h5YSGN-qX8LAb3zdxKNOTYjbN4_NMU9cap__VsFXzAleexufkBm76aX5IHQ18VQqt1O3VMcpnkjbkyC8OMJ07YoN_zs_x7PyGh2PKQyWkS7aZUTBly2xxh3Oi2Il92TnGoPrM8cxxmdPOx2eYTzdLbBbIqK0pw01ErPJj98nNxkDdRDTw-VxjdMqHFWeQ0xUsgPJzvUe4IxtdTyM2NYjoCe2dVQoB3WWYQRkta_fQCrHXuo`} alt={`${testimonial.author}'s headshot`} />
                  </div>
                  <div>
                    <p className="font-label-sm text-label-sm text-on-surface">{testimonial.author}</p>
                    <p className="text-xs text-on-surface-variant">{testimonial.company}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-stack-lg pt-stack-lg border-t border-outline-variant/30">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-gutter text-center">
              <div className="flex flex-col">
                <span className="font-h2 text-h2 text-primary">10,000+</span>
                <span className="font-label-sm text-label-sm text-on-surface-variant mt-1">Teams</span>
              </div>
              <div className="flex flex-col">
                <span className="font-h2 text-h2 text-primary">99.9%</span>
                <span className="font-label-sm text-label-sm text-on-surface-variant mt-1">Uptime</span>
              </div>
              <div className="flex flex-col">
                <span className="font-h2 text-h2 text-primary">4.9/5</span>
                <span className="font-label-sm text-label-sm text-on-surface-variant mt-1">Rating</span>
              </div>
              <div className="flex flex-col">
                <span className="font-h2 text-h2 text-primary">150+</span>
                <span className="font-label-sm text-label-sm text-on-surface-variant mt-1">Countries</span>
              </div>
            </div>
          </div>
        </section>
        <section className="py-stack-lg px-margin">
          <div className="max-w-container-max mx-auto bg-primary rounded-3xl p-12 text-center text-on-primary relative overflow-hidden shadow-xl shadow-primary/20">
            <div className="absolute inset-0 opacity-10 pointer-events-none">
              <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                <path d="M0 100 C 20 0 50 0 100 100 Z" fill="currentColor"></path>
              </svg>
            </div>
            <h2 className="font-h2 text-h2 mb-stack-sm relative z-10">Ready to scale your team?</h2>
            <p className="font-body-lg text-body-lg mb-stack-md opacity-90 relative z-10 max-w-xl mx-auto">Experience the platform that teams around the world depend on for their mission-critical operations.</p>
            <div className="flex flex-col sm:flex-row justify-center gap-base relative z-10">
              <button className="bg-surface-container-lowest text-primary font-label-sm text-label-sm px-8 py-4 rounded-full hover:shadow-lg transition-all active:scale-95">Start Free Trial</button>
              <button className="border border-on-primary text-on-primary font-label-sm text-label-sm px-8 py-4 rounded-full hover:bg-on-primary/10 transition-all active:scale-95">Book a Demo</button>
            </div>
          </div>
        </section>
      </main>
      <footer className="bg-surface-container-lowest dark:bg-surface-dim w-full mt-stack-lg border-t border-outline-variant/30 dark:border-outline-variant/10">
        <div className="max-w-container-max mx-auto px-margin py-stack-lg flex flex-col md:flex-row justify-between items-center gap-base">
          <div className="flex flex-col gap-base items-center md:items-start">
            <div className="font-h3 text-h3 font-bold text-primary dark:text-primary-fixed-dim">SaaSFlow</div>
            <p className="font-body-md text-body-md text-on-surface-variant dark:text-surface-variant text-center md:text-left">© 2024 SaaSFlow Inc. All rights reserved. Built for technical elegance.</p>
          </div>
          <div className="flex gap-gutter">
            <a className="font-body-md text-body-md text-on-surface-variant dark:text-surface-variant hover:text-primary dark:hover:text-primary-fixed transition-colors" href="#">Privacy Policy</a>
            <a className="font-body-md text-body-md text-on-surface-variant dark:text-surface-variant hover:text-primary dark:hover:text-primary-fixed transition-colors" href="#">Terms of Service</a>
            <a className="font-body-md text-body-md text-on-surface-variant dark:text-surface-variant hover:text-primary dark:hover:text-primary-fixed transition-colors" href="#">Status</a>
            <a className="font-body-md text-body-md text-on-surface-variant dark:text-surface-variant hover:text-primary dark:hover:text-primary-fixed transition-colors" href="#">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default TestimonialsPage;