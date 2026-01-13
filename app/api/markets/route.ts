import { NextRequest, NextResponse } from 'next/server';
import { getMarkets, getMarket, createMarket, placeBet, resolveMarket, getMarketBets, getAllUsers } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');
    const betsFor = request.nextUrl.searchParams.get('bets');

    if (betsFor) {
      const bets = await getMarketBets(betsFor);
      const users = await getAllUsers();

      // Enhance bets with user names
      const betsWithUsers = bets.map(bet => {
        const user = users.find(u => u.id === bet.userId);
        return {
          ...bet,
          userName: user?.name || 'Unknown',
        };
      });

      return NextResponse.json(betsWithUsers);
    }

    if (id) {
      const market = await getMarket(id);
      if (!market) {
        return NextResponse.json({ error: 'Market not found' }, { status: 404 });
      }
      return NextResponse.json(market);
    }

    const markets = await getMarkets();
    return NextResponse.json(markets);
  } catch (error) {
    console.error('Markets GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch markets', details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
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
