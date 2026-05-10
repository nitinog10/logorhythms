import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@/lib/db';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const searchQuery = searchParams.get('search') || '';
    const page = parseInt(searchParams.get('page') || '1', 10) || 1;
    const limit = parseInt(searchParams.get('limit') || '10', 10) || 10;

    const faqs = await prisma.fAQ.findMany({
      where: {
        OR: [
          { question: { contains: searchQuery, mode: 'insensitive' } },
          { answer: { contains: searchQuery, mode: 'insensitive' } },
        ],
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    const totalCount = await prisma.fAQ.count({
      where: {
        OR: [
          { question: { contains: searchQuery, mode: 'insensitive' } },
          { answer: { contains: searchQuery, mode: 'insensitive' } },
        ],
      },
    });

    return NextResponse.json({
      faqs,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching FAQs:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}