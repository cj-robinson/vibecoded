import { Redis } from '@upstash/redis';
import { User, Market, Bet } from './types';

if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
  throw new Error('Missing Redis environment variables: KV_REST_API_URL and KV_REST_API_TOKEN must be set');
}

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// Initialize default market if needed
async function ensureDefaultMarket(): Promise<void> {
  const exists = await redis.exists('markets:all');
  if (!exists) {
    const defaultMarket: Market = {
      id: '1',
      title: 'Will eat a whole package of turkey straight from the box',
      description: 'The subject must consume an entire package of sliced turkey (minimum 8oz) directly from the container, without plates or utensils, in one sitting.',
      createdBy: 'system',
      createdAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      resolved: false,
      outcome: null,
      yesPool: 5,
      noPool: 5,
    };
    await redis.set(`markets:${defaultMarket.id}`, JSON.stringify(defaultMarket));
    await redis.sadd('markets:all', defaultMarket.id);
  }
}

export async function getAllUsers(): Promise<User[]> {
  const userIds = await redis.smembers('users:all');
  if (!userIds || userIds.length === 0) return [];

  const users = await Promise.all(
    userIds.map(async (id) => {
      const data = await redis.get(`users:${id}`);
      if (!data) return null;
      return typeof data === 'string' ? JSON.parse(data) as User : data as User;
    })
  );

  return users.filter((u): u is User => u !== null);
}

export async function getUser(name: string): Promise<User | undefined> {
  const userId = await redis.get(`users:byName:${name.toLowerCase()}`);
  if (!userId) return undefined;
  const userData = await redis.get(`users:${userId as string}`);
  if (!userData) return undefined;
  return typeof userData === 'string' ? JSON.parse(userData) as User : userData as User;
}

export async function createUser(name: string): Promise<User> {
  const existing = await getUser(name);
  if (existing) return existing;

  const user: User = {
    id: crypto.randomUUID(),
    name,
    balance: 100,
    createdAt: new Date().toISOString(),
  };

  await redis.set(`users:${user.id}`, JSON.stringify(user));
  await redis.set(`users:byName:${name.toLowerCase()}`, user.id);
  await redis.sadd('users:all', user.id);

  return user;
}

export async function deleteUser(id: string): Promise<boolean> {
  const userData = await redis.get(`users:${id}`);
  if (!userData) return false;

  const user: User = typeof userData === 'string' ? JSON.parse(userData) as User : userData as User;
  await redis.del(`users:${id}`);
  await redis.del(`users:byName:${user.name.toLowerCase()}`);
  await redis.srem('users:all', id);

  return true;
}

export async function getMarkets(): Promise<Market[]> {
  try {
    await ensureDefaultMarket();
    const marketIds = await redis.smembers('markets:all');

    if (!marketIds || marketIds.length === 0) return [];

    const markets = await Promise.all(
      marketIds.map(async (id) => {
        const data = await redis.get(`markets:${id}`);
        if (!data) return null;
        // Data is already parsed by Upstash Redis client
        return typeof data === 'string' ? JSON.parse(data) as Market : data as Market;
      })
    );

    return markets.filter((m): m is Market => m !== null);
  } catch (error) {
    console.error('getMarkets error:', error);
    throw error;
  }
}

export async function getMarket(id: string): Promise<Market | undefined> {
  const data = await redis.get(`markets:${id}`);
  if (!data) return undefined;
  return typeof data === 'string' ? JSON.parse(data) as Market : data as Market;
}

export async function createMarket(market: Omit<Market, 'id' | 'createdAt' | 'resolved' | 'outcome' | 'yesPool' | 'noPool'>): Promise<Market> {
  const newMarket: Market = {
    ...market,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    resolved: false,
    outcome: null,
    yesPool: 5,
    noPool: 5,
  };

  await redis.set(`markets:${newMarket.id}`, JSON.stringify(newMarket));
  await redis.sadd('markets:all', newMarket.id);

  return newMarket;
}

export async function placeBet(userId: string, marketId: string, amount: number, position: 'yes' | 'no'): Promise<{ bet: Bet; user: User; market: Market } | { error: string }> {
  const userData = await redis.get(`users:${userId}`);
  if (!userData) return { error: 'User not found' };
  const user: User = typeof userData === 'string' ? JSON.parse(userData) as User : userData as User;

  const marketData = await redis.get(`markets:${marketId}`);
  if (!marketData) return { error: 'Market not found' };
  const market: Market = typeof marketData === 'string' ? JSON.parse(marketData) as Market : marketData as Market;

  if (market.resolved) return { error: 'Market is already resolved' };
  if (amount <= 0) return { error: 'Amount must be positive' };
  if (amount > user.balance) return { error: 'Insufficient balance' };

  // Update user balance
  user.balance -= amount;
  await redis.set(`users:${userId}`, JSON.stringify(user));

  // Update market pools
  if (position === 'yes') {
    market.yesPool += amount;
  } else {
    market.noPool += amount;
  }
  await redis.set(`markets:${marketId}`, JSON.stringify(market));

  // Create bet
  const bet: Bet = {
    id: crypto.randomUUID(),
    oddsAtBet: market.yesPool / (market.yesPool + market.noPool),
    oddsDirection: position,
    userId,
    marketId,
    amount,
    position,
    createdAt: new Date().toISOString(),
  };

  await redis.set(`bets:${bet.id}`, JSON.stringify(bet));
  await redis.sadd(`bets:user:${userId}`, bet.id);
  await redis.sadd(`bets:market:${marketId}`, bet.id);

  return { bet, user, market };
}

export async function resolveMarket(marketId: string, outcome: boolean): Promise<Market | { error: string }> {
  const marketData = await redis.get(`markets:${marketId}`);
  if (!marketData) return { error: 'Market not found' };
  const market: Market = typeof marketData === 'string' ? JSON.parse(marketData) as Market : marketData as Market;

  if (market.resolved) return { error: 'Market already resolved' };

  market.resolved = true;
  market.outcome = outcome;

  const winningPosition = outcome ? 'yes' : 'no';
  const totalPool = market.yesPool + market.noPool;
  const winningPool = outcome ? market.yesPool : market.noPool;

  // Get all bets for this market
  const betIds = await redis.smembers(`bets:market:${marketId}`);
  if (betIds && betIds.length > 0) {
    const bets = await Promise.all(
      betIds.map(async (id) => {
        const data = await redis.get(`bets:${id}`);
        if (!data) return null;
        return typeof data === 'string' ? JSON.parse(data) as Bet : data as Bet;
      })
    );

    const winningBets = bets.filter((b): b is Bet => b !== null && b.position === winningPosition);

    // Update winners' balances
    for (const bet of winningBets) {
      const userData = await redis.get(`users:${bet.userId}`);
      if (userData) {
        const user: User = typeof userData === 'string' ? JSON.parse(userData) as User : userData as User;
        const share = bet.amount / winningPool;
        user.balance += share * totalPool;
        await redis.set(`users:${bet.userId}`, JSON.stringify(user));
      }
    }
  }

  await redis.set(`markets:${marketId}`, JSON.stringify(market));
  return market;
}

export async function getUserBets(userId: string): Promise<Bet[]> {
  const betIds = await redis.smembers(`bets:user:${userId}`);
  if (!betIds || betIds.length === 0) return [];

  const bets = await Promise.all(
    betIds.map(async (id) => {
      const data = await redis.get(`bets:${id}`);
      if (!data) return null;
      return typeof data === 'string' ? JSON.parse(data) as Bet : data as Bet;
    })
  );

  return bets.filter((b): b is Bet => b !== null);
}

export async function getMarketBets(marketId: string): Promise<Bet[]> {
  const betIds = await redis.smembers(`bets:market:${marketId}`);
  if (!betIds || betIds.length === 0) return [];

  const bets = await Promise.all(
    betIds.map(async (id) => {
      const data = await redis.get(`bets:${id}`);
      if (!data) return null;
      return typeof data === 'string' ? JSON.parse(data) as Bet : data as Bet;
    })
  );

  return bets.filter((b): b is Bet => b !== null);
}
