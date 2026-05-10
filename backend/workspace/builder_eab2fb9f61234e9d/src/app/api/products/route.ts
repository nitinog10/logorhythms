import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@/lib/db';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '10', 10);
    const search = searchParams.get('search') || '';
    const category = searchParams.get('category') || undefined;
    const brand = searchParams.get('brand') || undefined;

    const whereClause = {
      name: {
        contains: search,
        mode: 'insensitive',
      },
    };

    if (category) {
      whereClause['category'] = category;
    }

    if (brand) {
      whereClause['brand'] = brand;
    }

    const products = await prisma.product.findMany({
      where: whereClause,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const totalCount = await prisma.product.count({
      where: whereClause,
    });

    return NextResponse.json({
      products,
      pagination: {
        page,
        pageSize,
        totalCount,
      },
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}