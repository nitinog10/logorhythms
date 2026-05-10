'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';

type FAQ = {
  id: string;
  question: string;
  answer: string;
};

const faqs: FAQ[] = [
  { id: '1', question: 'How does the pricing work?', answer: 'Our pricing is structured around transparent, scalable tiers designed to grow with your business. We offer Monthly and Annual subscriptions, with a 20% discount on annual commitments. Each plan is defined by the number of active users and data throughput limits.' },
  { id: '2', question: 'What are the core features included?', answer: 'All plans include our core automation engine, real-time analytics dashboard, team collaboration tools, and mobile accessibility. Advanced tiers unlock features like predictive modeling, custom API endpoints, and dedicated account management.' },
  { id: '3', question: 'Is my data secure?', answer: 'Security is our primary concern. We utilize AES-256 encryption at rest and TLS 1.3 for data in transit. Our infrastructure is SOC2 Type II compliant and hosted on Tier-4 data centers with 99.99% uptime guarantees.' },
  { id: '4', question: 'What kind of support do you offer?', answer: 'Standard users have access to our email support and extensive documentation. Business and Enterprise customers receive 24/7 priority live chat and phone support, along with a dedicated Success Manager to ensure optimal platform utilization.' },
  { id: '5', question: 'Do you integrate with other tools?', answer: 'Yes, SaaSFlow features 150+ native integrations including Slack, Salesforce, Google Workspace, and Microsoft Azure. Our robust REST API and Webhooks allow for custom integrations with any proprietary internal systems you may use.' },
  { id: '6', question: 'Is there a free trial available?', answer: 'We offer a full-featured 14-day free trial on our Business tier. No credit card is required to start. At the end of the trial, you can choose to subscribe or downgrade to a limited-feature free version.' },
  { id: '7', question: 'Can I upgrade or downgrade my plan at any time?', answer: 'Absolutely. Plan changes take effect immediately. Upgrades are prorated for the current billing cycle, while downgrades will reflect on your next billing period. All your data and settings are preserved during transitions.' },
];

const FAQPage = () => {
  const [faqList, setFaqList] = useState<FAQ[]>(faqs);

  useEffect(() => {
    // Fetch data from API
    const fetchFAQs = async () => {
      try {
        const response = await axios.get('/api/faqs');
        setFaqList(response.data);
      } catch (error) {
        console.error('Error fetching FAQs:', error);
      }
    };

    fetchFAQs();
  }, []);

  const handleDelete = async (id: string) => {
    try {
      await axios.delete(`/api/faqs/${id}`);
      setFaqList(faqList.filter(faq => faq.id!== id));
    } catch (error) {
      console.error('Error deleting FAQ:', error);
    }
  };

  return (
    <div className="bg-background text-on-background font-body-md selection:bg-primary-fixed selection:text-on-primary-fixed">
      <nav className="fixed top-0 w-full z-50 flex justify-between items-center h-20 px-margin max-w-container-max mx-auto bg-surface/80 backdrop-blur-md shadow-sm">
        <div className="flex items-center gap-base">
          <span className="font-h3 text-h3 font-bold text-primary">SaaSFlow</span>
        </div>
        <div className="hidden md:flex items-center gap-gutter">
          <a className="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors" href="#">Features</a>
          <a className="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors" href="#">Pricing</a>
          <a className="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors" href="#">About</a>
          <a className="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors" href="#">Blog</a>
        </div>
        <div className="flex items-center gap-stack-sm">
          <button className="font-label-sm text-label-sm text-on-surface-variant px-stack-md py-base hover:opacity-90 transition-opacity">Login</button>
          <button className="font-label-sm text-label-sm bg-primary-container text-on-primary-container px-stack-md py-base rounded-full shadow-sm hover:opacity-90 transition-opacity active:scale-95 duration-150 ease-in-out">Sign Up</button>
        </div>
      </nav>
      <main className="pt-[120px] pb-stack-lg">
        <header className="max-w-container-max mx-auto px-margin text-center mb-stack-lg">
          <span className="inline-block px-stack-sm py-1 bg-primary-fixed text-on-primary-fixed-variant text-label-sm font-label-sm rounded-full mb-stack-sm">Support Center</span>
          <h1 className="font-h1 text-h1 text-on-surface mb-stack-sm">Frequently Asked Questions</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl mx-auto">
            Everything you need to know about SaaSFlow. Can't find the answer you're looking for? Reach out to our 24/7 technical team.
          </p>
        </header>
        <section className="max-w-container-max mx-auto px-margin grid grid-cols-1 lg:grid-cols-12 gap-gutter">
          <div className="lg:col-span-4 flex flex-col gap-gutter">
            <div className="p-stack-lg rounded-xl bg-surface-container-low border border-outline-variant shadow-sm flex flex-col items-start gap-stack-sm">
              <span className="material-symbols-outlined text-primary text-4xl" data-icon="help_center">help_center</span>
              <h3 className="font-h3 text-h3 text-on-surface">Need help?</h3>
              <p className="font-body-md text-body-md text-on-surface-variant">Our comprehensive documentation covers every aspect of the platform configuration and workflow optimization.</p>
              <a className="text-primary font-label-sm flex items-center gap-2 hover:underline" href="#">
                Visit Help Center
                <span className="material-symbols-outlined text-sm" data-icon="arrow_forward">arrow_forward</span>
              </a>
            </div>
            <div className="relative overflow-hidden rounded-xl aspect-square lg:aspect-auto lg:h-full min-h-[300px] border border-outline-variant">
              <img alt="Support Team" className="absolute inset-0 w-full h-full object-cover" data-alt="A diverse and modern customer support team working in a bright, collaborative office space with glass walls and minimalist furniture. The lighting is soft and professional, reflecting a high-end SaaS company culture focused on user success and reliability. The color palette is dominated by soft blues and whites to match the technical elegance of the brand identity." src="https://lh3.googleusercontent.com/aida-public/AB6AXuCNO3aHP-XKizq_MQv9OaYb0DVQjYvOBdPe3Px_wsGndMfQzkMpSli6dE3dcR0bWCkhfKzm3qES5RP2mnHa-pb2Gh6pXcIcXYgoob2OHWcMUCn4VuqfdpkeQxWRmhvd1LKCV-kYm0TKCqR6Fm0K32sejvqM3KZCiIJKk2UvuFhEYrEh9i2lXGI1zA5cWdlnVl60E5T2hA0NI3B0ICz99xc1B5vWTt6ypxGBPqFq6DTrTeI6a943EIoQApyzQqqfpXHw6TCCk-AC564"/>
              <div className="absolute inset-0 bg-gradient-to-t from-primary/60 to-transparent"></div>
              <div className="absolute bottom-0 p-stack-md">
                <p className="text-white font-body-md italic">"SaaSFlow has transformed our operational speed by 40%."</p>
                <p className="text-primary-fixed font-label-sm mt-1">— Sarah Chen, CTO at TechStream</p>
              </div>
            </div>
          </div>
          <div className="lg:col-span-8 flex flex-col gap-stack-sm">
            {faqList.map(faq => (
              <details key={faq.id} className="faq-item group bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden transition-all duration-300">
                <summary className="flex justify-between items-center p-stack-md cursor-pointer list-none hover:bg-surface-container-low transition-colors">
                  <span className="font-h3 text-h3 text-on-surface text-[18px]">{faq.question}</span>
                  <span className="faq-icon material-symbols-outlined text-on-surface-variant transition-transform duration-300" data-icon="expand_more">expand_more</span>
                </summary>
                <div className="px-stack-md pb-stack-md text-on-surface-variant font-body-md">
                  {faq.answer}
                </div>
                <button onClick={() => handleDelete(faq.id)} className="text-red-500 hover:underline">Delete</button>
              </details>
            ))}
          </div>
        </section>
        <section className="max-w-container-max mx-auto px-margin mt-stack-lg">
          <div className="relative bg-primary-container p-stack-lg rounded-xl overflow-hidden text-center flex flex-col items-center gap-stack-sm shadow-xl">
            <div className="absolute -top-12 -left-12 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
            <div className="absolute -bottom-12 -right-12 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
            <h2 className="font-h2 text-h2 text-on-primary-container relative z-10">Still have questions? Contact us</h2>
            <p className="font-body-lg text-body-lg text-on-primary-container/80 max-w-xl relative z-10">
              Our team of product experts is ready to help you find the right solution for your specific technical needs.
            </p>
            <div className="flex flex-col sm:flex-row gap-base mt-stack-sm relative z-10">
              <button className="bg-white text-primary px-margin py-base rounded-full font-label-sm shadow-lg hover:bg-surface-bright transition-all active:scale-95">Get in Touch</button>
              <button className="border-2 border-white text-white px-margin py-base rounded-full font-label-sm hover:bg-white/10 transition-all">Schedule a Demo</button>
            </div>
          </div>
        </section>
      </main>
      <footer className="w-full py-stack-lg px-margin flex flex-col md:flex-row justify-between items-center gap-base bg-surface-container-lowest border-t border-outline-variant">
        <div className="flex flex-col items-center md:items-start gap-stack-sm">
          <span className="font-h3 text-h3 font-bold text-primary">SaaSFlow</span>
          <span className="font-label-sm text-label-sm text-on-surface-variant">© 2024 SaaSFlow Inc. All rights reserved.</span>
        </div>
        <div className="flex flex-wrap justify-center gap-gutter">
          <a className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary transition-all" href="#">Privacy Policy</a>
          <a className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary transition-all" href="#">Terms of Service</a>
          <a className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary transition-all" href="#">Cookie Policy</a>
          <a className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary transition-all" href="#">Contact Us</a>
        </div>
      </footer>
      <style jsx>{`
       .faq-item[open].faq-icon {
          transform: rotate(180deg);
        }
       .faq-item summary::-webkit-details-marker {
          display: none;
        }
       .glass-panel {
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
      `}</style>
    </div>
  );
};

export default FAQPage;