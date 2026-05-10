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
  timestamp: z.date(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const endpoint = searchParams.get('endpoint');
    const method = searchParams.get('method');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    const where = {
      endpoint: endpoint || undefined,
      method: method || undefined,
    };

    const apiUsages = await prisma.apiUsage.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
    });

    const totalCount = await prisma.apiUsage.count({ where });

    return NextResponse.json({
      data: apiUsages,
      pagination: { page, limit, totalCount },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { id } = request.params;
    const body = await request.json();
    const parsedBody = ApiUsageSchema.omit({ id: true }).parse(body);

    const updatedApiUsage = await prisma.apiUsage.update({
      where: { id: id as string },
      data: parsedBody,
    });

    return NextResponse.json(updatedApiUsage);
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

    await prisma.apiUsage.delete({
      where: { id: id as string },
    });

    return NextResponse.json({ message: 'ApiUsage deleted successfully' });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}