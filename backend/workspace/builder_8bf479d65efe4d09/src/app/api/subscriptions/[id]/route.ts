import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@/lib/db';
import { z } from 'zod';

const prisma = new PrismaClient();

const subscriptionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  plan: z.string(),
  startDate: z.date(),
  endDate: z.date(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const plan = searchParams.get('plan');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    const where: any = {};
    if (userId) where.userId = userId;
    if (plan) where.plan = plan;

    const subscriptions = await prisma.subscription.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
    });

    return NextResponse.json(subscriptions, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch subscriptions' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { id } = request.params;
    const body = await request.json();
    const validatedData = subscriptionSchema.omit({ id: true }).parse(body);

    const updatedSubscription = await prisma.subscription.update({
      where: { id: id as string },
      data: validatedData,
    });

    return NextResponse.json(updatedSubscription, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to update subscription' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = request.params;

    await prisma.subscription.delete({
      where: { id: id as string },
    });

    return NextResponse.json({ message: 'Subscription deleted' }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete subscription' }, { status: 500 });
  }
}