import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@/lib/db';
import { z } from 'zod';

const prisma = new PrismaClient();

const subscriptionSchema = z.object({
  userId: z.string(),
  plan: z.enum(['starter', 'pro', 'enterprise']),
  billingCycle: z.enum(['monthly', 'yearly']),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const plan = searchParams.get('plan');
    const billingCycle = searchParams.get('billingCycle');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    const where: any = {};
    if (userId) where.userId = userId;
    if (plan) where.plan = plan;
    if (billingCycle) where.billingCycle = billingCycle;

    const subscriptions = await prisma.subscription.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
    });

    return NextResponse.json(subscriptions, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { id } = request.params;
    const body = await request.json();
    const parsedBody = subscriptionSchema.parse(body);

    const updatedSubscription = await prisma.subscription.update({
      where: { id: id as string },
      data: parsedBody,
    });

    return NextResponse.json(updatedSubscription, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation Error', issues: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
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
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}