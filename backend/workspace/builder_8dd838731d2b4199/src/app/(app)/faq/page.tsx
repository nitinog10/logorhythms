'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';

interface FAQItem {
  question: string;
  answer: string;
}

const faqData: FAQItem[] = [
  {
    question: 'How much does Luminous cost?',
    answer: 'We offer flexible pricing plans designed to scale with your business. Contact our sales team for a custom quote or view our pricing page for standard tiers.'
  },
  {
    question: 'What are the key features of the platform?',
    answer: 'Luminous includes AI-driven automation, real-time analytics dashboards, global infrastructure scaling, and seamless enterprise-grade security protocols.'
  },
  {
    question: 'How secure is my data?',
    answer: 'Data security is our top priority. We use industry-standard enterprise encryption and maintain strict compliance with global data protection regulations.'
  },
  {
    question: 'What kind of support do you offer?',
    answer: 'We offer 24/7 technical support for all our enterprise customers, along with extensive documentation and a dedicated account manager.'
  },
  {
    question: 'Which tools can I integrate with Luminous?',
    answer: 'Luminous integrates with all major engineering tools, cloud providers, and communication platforms like Slack, AWS, and GitHub.'
  },
  {
    question: 'Is there a free trial available?',
    answer: 'Yes, we offer a 14-day free trial with full access to all features so you can experience the power of Luminous firsthand.'
  },
  {
    question: 'Can I change my plan later?',
    answer: 'Absolutely. You can upgrade or downgrade your plan at any time. Changes will be reflected in your next billing cycle.'
  }
];

const FAQPage = () => {
  const [faqs, setFaqs] = useState<FAQItem[]>(faqData);

  return (
    <div className="bg-surface font-body-md text-on-surface selection:bg-primary-fixed-dim selection:text-on-primary-fixed min-h-screen mesh-gradient">
      <section className="py-stack-lg px-margin-page bg-surface-container-low/50">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-headline-lg text-headline-lg text-on-background mb-4">Frequently Asked Questions</h2>
            <p className="font-body-md text-body-md text-on-surface-variant">Everything you need to know about Luminous.</p>
          </div>
          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <details key={index} className="group glass-card rounded-xl overflow-hidden">
                <summary className="flex items-center justify-between p-6 cursor-pointer list-none font-headline-md text-on-background hover:bg-surface-container-high transition-colors">
                  <span>{faq.question}</span>
                  <span className="material-symbols-outlined transition-transform group-open:rotate-180">expand_more</span>
                </summary>
                <div className="p-6 pt-0 font-body-md text-on-surface-variant">
                  {faq.answer}
                </div>
              </details>
            ))}
          </div>
          <div className="mt-16 text-center">
            <p className="font-body-lg text-on-surface-variant mb-6">Still have questions? Contact us</p>
            <button className="bg-primary text-on-primary px-8 py-3 rounded-xl font-semibold hover:opacity-90 active:scale-95 transition-all shadow-md">Get in Touch</button>
          </div>
        </div>
      </section>
      <footer className="bg-surface-container-lowest border-t border-outline-variant/10">
        <div className="flex flex-col md:flex-row justify-between items-center px-margin-page py-stack-md gap-4 max-w-container-max mx-auto">
          <div className="flex items-center gap-4">
            <span className="font-headline-md text-headline-md text-primary font-bold">Luminous</span>
            <span className="font-body-md text-body-md text-on-surface-variant">© 2024 Luminous SaaS. All rights reserved.</span>
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

export default FAQPage;