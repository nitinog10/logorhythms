import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@/lib/db';

const db = new PrismaClient();

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const name = searchParams.get('name');
  const category = searchParams.get('category');
  const brand = searchParams.get('brand');
  const rating = searchParams.get('rating');
  const price = searchParams.get('price');
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') || '10', 10);

  try {
    let whereClause: any = {};

    if (id) whereClause.id = id;
    if (name) whereClause.name = { contains: name, mode: 'insensitive' };
    if (category) whereClause.category = category;
    if (brand) whereClause.brand = brand;
    if (rating) whereClause.rating = parseFloat(rating);
    if (price) whereClause.price = parseFloat(price);

    const products = await db.product.findMany({
      where: whereClause,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const totalCount = await db.product.count({ where: whereClause });
    const totalPages = Math.ceil(totalCount / pageSize);

    return NextResponse.json({
      data: products,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages,
      },
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}