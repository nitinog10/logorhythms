import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@/lib/db';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '10', 10);

    const where = month? { month } : {};
    const revenues = await prisma.revenue.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const totalCount = await prisma.revenue.count({ where });
    const totalPages = Math.ceil(totalCount / pageSize);

    return NextResponse.json({
      data: revenues,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages,
      },
    });
  } catch (error) {
    console.error('Error fetching revenues:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}