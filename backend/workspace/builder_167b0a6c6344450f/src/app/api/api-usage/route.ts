import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@/lib/db';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const endpoint = searchParams.get('endpoint');
    const method = searchParams.get('method');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');

    const whereClause: any = {};
    if (endpoint) whereClause.endpoint = endpoint;
    if (method) whereClause.method = method;

    const apiUsages = await prisma.apiUsage.findMany({
      where: whereClause,
      skip: (page - 1) * limit,
      take: limit,
    });

    const totalCount = await prisma.apiUsage.count({ where: whereClause });
    const totalPages = Math.ceil(totalCount / limit);

    return NextResponse.json({
      data: apiUsages,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, endpoint, method, avgLatency, errorRate, callCount } = body;

    if (!userId ||!endpoint ||!method || !avgLatency ||!errorRate ||!callCount) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const newApiUsage = await prisma.apiUsage.create({
      data: {
        userId,
        endpoint,
        method,
        avgLatency,
        errorRate,
        callCount,
        timestamp: new Date(),
      },
    });

    return NextResponse.json(newApiUsage, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}