import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@/lib/db';
import { z } from 'zod';

const prisma = new PrismaClient();

const ApiUsageSchema = z.object({
  id: z.string(),
  endpoint: z.string(),
  method: z.string(),
  avgLatency: z.number(),
  errorRate: z.number(),
  callCount: z.number(),
  timestamp: z.date()
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const endpoint = searchParams.get('endpoint');
    const method = searchParams.get('method');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '10', 10);

    const where = {
      endpoint: endpoint || undefined,
      method: method || undefined
    };

    const apiUsages = await prisma.apiUsage.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize
    });

    const totalCount = await prisma.apiUsage.count({ where });

    return NextResponse.json({
      data: apiUsages,
      pagination: {
        page,
        pageSize,
        totalCount
      }
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const parsed = ApiUsageSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const apiUsage = await prisma.apiUsage.create({
      data: parsed.data
    });

    return NextResponse.json(apiUsage, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}