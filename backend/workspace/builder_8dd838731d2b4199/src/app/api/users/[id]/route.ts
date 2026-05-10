import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@/lib/db';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const email = searchParams.get('email');
    const name = searchParams.get('name');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '10', 10);

    let whereClause: any = {};
    if (id) whereClause.id = id;
    if (email) whereClause.email = email;
    if (name) whereClause.name = { contains: name, mode: 'insensitive' };

    const users = await prisma.user.findMany({
      where: whereClause,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const totalCount = await prisma.user.count({ where: whereClause });

    return NextResponse.json({
      users,
      pagination: {
        page,
        pageSize,
        totalCount,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { id } = await request.json();
    const { email, name } = await request.json();

    if (!id ||!email || !name) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { id },
      data: { email, name },
    });

    return NextResponse.json(user);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    await prisma.user.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'User deleted successfully' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}