import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@/lib/db';
import { z } from 'zod';

const prisma = new PrismaClient();

const subscriptionSchema = z.object({
  userId: z.string(),
  plan: z.string(),
  startDate: z.date(),
  endDate: z.date(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '10', 10);

    const subscriptions = await prisma.subscription.findMany({
      where: { userId },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const count = await prisma.subscription.count({ where: { userId } });

    return NextResponse.json({ subscriptions, totalPages: Math.ceil(count / pageSize) }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch subscriptions' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsedBody = subscriptionSchema.parse(body);

    const newSubscription = await prisma.subscription.create({
      data: {
        id: crypto.randomUUID(),
       ...parsedBody,
      },
    });

    return NextResponse.json(newSubscription, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', issues: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create subscription' }, { status: 500 });
  }
}