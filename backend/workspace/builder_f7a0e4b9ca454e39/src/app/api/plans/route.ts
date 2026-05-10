import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@/lib/db';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '10');
    const search = searchParams.get('search') || '';

    const plans = await prisma.plan.findMany({
      where: {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { features: { hasSome: search.split(',') } },
        ],
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const totalCount = await prisma.plan.count({
      where: {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { features: { hasSome: search.split(',') } },
        ],
      },
    });

    return NextResponse.json({
      data: plans,
      pagination: {
        page,
        pageSize,
        totalCount,
      },
    });
  } catch (error) {
    console.error('Error fetching plans:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}