import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@/lib/db';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '10', 10);

    const where = name? { name: { contains: name } } : {};

    const plans = await prisma.plan.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const totalCount = await prisma.plan.count({ where });

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