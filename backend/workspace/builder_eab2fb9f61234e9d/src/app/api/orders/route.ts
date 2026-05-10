import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@/lib/db';
import { z } from 'zod';

const prisma = new PrismaClient();

const OrderSchema = z.object({
  id: z.string().optional(),
  userId: z.string(),
  products: z.array(z.object({
    id: z.string(),
    quantity: z.number()
  })),
  total: z.number(),
  status: z.string(),
  createdAt: z.date().optional()
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = searchParams.get('page')? parseInt(searchParams.get('page')!) : 1;
    const pageSize = searchParams.get('pageSize')? parseInt(searchParams.get('pageSize')!) : 10;
    const status = searchParams.get('status');

    const where = status? { status } : {};

    const orders = await prisma.order.findMany({
      skip: (page - 1) * pageSize,
      take: pageSize,
      where,
      include: {
        products: true
      }
    });

    const totalCount = await prisma.order.count({ where });

    return NextResponse.json({
      orders,
      pagination: {
        page,
        pageSize,
        totalCount
      }
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const parsed = OrderSchema.parse(json);

    const order = await prisma.order.create({
      data: {
        ...parsed,
        createdAt: new Date()
      },
      include: {
        products: true
      }
    });

    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
  }
}