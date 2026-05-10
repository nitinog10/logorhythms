import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@/lib/db';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const search = searchParams.get('search') || '';

    const testimonials = await prisma.testimonial.findMany({
      where: {
        OR: [
          { author: { contains: search } },
          { company: { contains: search } },
          { content: { contains: search } },
        ],
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    const total = await prisma.testimonial.count({
      where: {
        OR: [
          { author: { contains: search } },
          { company: { contains: search } },
          { content: { contains: search } },
        ],
      },
    });

    return NextResponse.json({
      testimonials,
      meta: {
        total,
        page,
        last_page: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}