'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';

interface Testimonial {
  id: string;
  author: string;
  company: string;
  content: string;
}

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
        setError('Failed to fetch testimonials');
        setLoading(false);
      }
    };

    fetchTestimonials();
  }, []);

  if (loading) return <p>Loading...</p>;
  if (error) return <p>{error}</p>;

  return (
    <div className="bg-surface font-body-md text-on-surface selection:bg-primary-fixed-dim selection:text-on-primary-fixed min-h-screen mesh-gradient">
      <section className="py-stack-lg px-margin-page bg-surface-container-low">
        <div className="max-w-container-max mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-headline-lg text-headline-lg text-on-background mb-4">Loved by teams worldwide</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter mb-20">
            {testimonials.map((testimonial) => (
              <div key={testimonial.id} className="bg-white p-8 rounded-xl shadow-sm flex flex-col gap-6">
                <div className="flex text-yellow-500">
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                </div>
                <p className="font-body-md text-body-md text-on-surface-variant italic">{`"${testimonial.content}"`}</p>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary-fixed flex items-center justify-center text-primary font-bold">
                    {testimonial.author.slice(0, 2)}
                  </div>
                  <div>
                    <p className="font-body-md text-on-background font-semibold">{testimonial.author}</p>
                    <p className="font-label-sm text-label-sm text-outline">{testimonial.company}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default TestimonialsPage;