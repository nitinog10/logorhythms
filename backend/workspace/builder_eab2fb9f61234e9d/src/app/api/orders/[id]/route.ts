import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@/lib/db';

const db = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const userId = searchParams.get('userId');
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '10', 10);

    let whereClause: any = {};

    if (id) whereClause.id = id;
    if (userId) whereClause.userId = userId;
    if (status) whereClause.status = status;

    const orders = await db.order.findMany({
      where: whereClause,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const totalCount = await db.order.count({ where: whereClause });
    const totalPages = Math.ceil(totalCount / pageSize);

    return NextResponse.json({
      data: orders,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { id } = await request.json();
    const { userId, products, total, status } = await request.json();

    if (!id ||!userId ||!products || typeof total!== 'number' || !status) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const updatedOrder = await db.order.update({
      where: { id },
      data: { userId, products, total, status },
    });

    return NextResponse.json(updatedOrder);
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    await db.order.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'Order deleted successfully' });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}