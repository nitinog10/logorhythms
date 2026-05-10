import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@/lib/db';
import { z } from 'zod';

const prisma = new PrismaClient();

const userSchema = z.object({
  email: z.string().email(),
  name: z.string(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = searchParams.get('page')? parseInt(searchParams.get('page')!) : 1;
    const pageSize = searchParams.get('pageSize')? parseInt(searchParams.get('pageSize')!) : 10;
    const email = searchParams.get('email');

    const users = await prisma.user.findMany({
      where: email? { email: { contains: email } } : undefined,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const totalCount = await prisma.user.count({
      where: email? { email: { contains: email } } : undefined,
    });

    return NextResponse.json({
      users,
      pagination: {
        page,
        pageSize,
        totalCount,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { id } = request.params;
    const json = await request.json();
    const validatedData = userSchema.parse(json);

    const user = await prisma.user.update({
      where: { id: id as string },
      data: validatedData,
    });

    return NextResponse.json(user);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = request.params;

    await prisma.user.delete({
      where: { id: id as string },
    });

    return NextResponse.json({ message: 'User deleted successfully' });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}