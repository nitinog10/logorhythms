import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@/lib/db';
import { z } from 'zod';

const prisma = new PrismaClient();

const OrderSchema = z.object({
  userId: z.string(),
  productId: z.string(),
  quantity: z.number().int().positive(),
  total: z.number().positive(),
  status: z.string(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = searchParams.get('page') ? parseInt(searchParams.get('page')!) : 1;
    const pageSize = searchParams.get('pageSize')? parseInt(searchParams.get('pageSize')!) : 10;
    const userId = searchParams.get('userId');
    const productId = searchParams.get('productId');
    const status = searchParams.get('status');

    const whereClause: any = {};

    if (userId) whereClause.userId = userId;
    if (productId) whereClause.productId = productId;
    if (status) whereClause.status = status;

    const orders = await prisma.order.findMany({
      where: whereClause,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const totalCount = await prisma.order.count({ where: whereClause });

    return NextResponse.json({
      data: orders,
      pagination: {
        page,
        pageSize,
        totalCount,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const parsed = OrderSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { userId, productId, quantity, total, status } = parsed.data;

    const order = await prisma.order.create({
      data: {
        userId,
        productId,
        quantity,
        total,
        status,
        createdAt: new Date(),
      },
    });

    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}