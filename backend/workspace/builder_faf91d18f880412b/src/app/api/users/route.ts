import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@/lib/db';
import { z } from 'zod';

const prisma = new PrismaClient();

const UserSchema = z.object({
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
      where: {
        email: email? { contains: email } : undefined,
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const totalCount = await prisma.user.count({
      where: {
        email: email ? { contains: email } : undefined,
      },
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
    console.error(error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const parsed = UserSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
    }

    const { email, name } = parsed.data;

    const user = await prisma.user.create({
      data: {
        email,
        name,
        createdAt: new Date(),
      },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}