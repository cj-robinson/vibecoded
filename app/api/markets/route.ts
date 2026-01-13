import { NextRequest, NextResponse } from 'next/server';
import { getMarkets, getMarket, createMarket, placeBet, resolveMarket } from '@/lib/db';

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');

  if (id) {
    const market = await getMarket(id);
    if (!market) {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 });
    }
    return NextResponse.json(market);
  }

  const markets = await getMarkets();
  return NextResponse.json(markets);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action } = body;

  if (action === 'create') {
    const { title, description, endsAt, createdBy } = body;

    if (!title || !description || !endsAt || !createdBy) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const market = await createMarket({
      title,
      description,
      endsAt,
      createdBy,
    });
    return NextResponse.json(market);
  }

  if (action === 'bet') {
    const { userId, marketId, amount, position } = body;

    if (!userId || !marketId || !amount || !position) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (position !== 'yes' && position !== 'no') {
      return NextResponse.json({ error: 'Position must be yes or no' }, { status: 400 });
    }

    const result = await placeBet(userId, marketId, amount, position);

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  }

  if (action === 'resolve') {
    const { marketId, outcome } = body;

    if (!marketId || typeof outcome !== 'boolean') {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const result = await resolveMarket(marketId, outcome);

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
