import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@/lib/db';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const plan = searchParams.get('plan');
    const billingCycle = searchParams.get('billingCycle');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    const whereClause: any = {};
    if (userId) whereClause.userId = userId;
    if (plan) whereClause.plan = plan;
    if (billingCycle) whereClause.billingCycle = billingCycle;

    const subscriptions = await prisma.subscription.findMany({
      where: whereClause,
      skip: (page - 1) * limit,
      take: limit,
    });

    const totalCount = await prisma.subscription.count({ where: whereClause });
    const totalPages = Math.ceil(totalCount / limit);

    return NextResponse.json({
      data: subscriptions,
      pagination: {
        page,
        limit,
        totalPages,
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
    const body = await request.json();
    const { userId, plan, billingCycle } = body;

    if (!userId ||!plan ||!billingCycle) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const newSubscription = await prisma.subscription.create({
      data: {
        userId,
        plan,
        billingCycle,
        createdAt: new Date(),
      },
    });

    return NextResponse.json(newSubscription, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}