import { promises as fs } from 'fs';
import path from 'path';
import { Database, User, Market, Bet } from './types';

const DB_PATH = path.join(process.cwd(), 'data', 'db.json');

const defaultDb: Database = {
  users: [],
  markets: [
    {
      id: '1',
      title: 'Will eat a whole package of turkey straight from the box',
      description: 'The subject must consume an entire package of sliced turkey (minimum 8oz) directly from the container, without plates or utensils, in one sitting.',
      createdBy: 'system',
      createdAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      resolved: false,
      outcome: null,
      yesPool: 50,
      noPool: 50,
    }
  ],
  bets: [],
};

async function ensureDbExists(): Promise<void> {
  try {
    await fs.access(path.dirname(DB_PATH));
  } catch {
    await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  }

  try {
    await fs.access(DB_PATH);
  } catch {
    await fs.writeFile(DB_PATH, JSON.stringify(defaultDb, null, 2));
  }
}

export async function readDb(): Promise<Database> {
  await ensureDbExists();
  const data = await fs.readFile(DB_PATH, 'utf-8');
  return JSON.parse(data);
}

export async function writeDb(db: Database): Promise<void> {
  await ensureDbExists();
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2));
}

export async function getUser(name: string): Promise<User | undefined> {
  const db = await readDb();
  return db.users.find(u => u.name.toLowerCase() === name.toLowerCase());
}

export async function createUser(name: string): Promise<User> {
  const db = await readDb();
  const existing = db.users.find(u => u.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing;

  const user: User = {
    id: crypto.randomUUID(),
    name,
    balance: 100,
    createdAt: new Date().toISOString(),
  };
  db.users.push(user);
  await writeDb(db);
  return user;
}

export async function deleteUser(id: string): Promise<boolean> {
  const db = await readDb();
  const index = db.users.findIndex(u => u.id === id);
  if (index === -1) return false;
  db.users.splice(index, 1);
  await writeDb(db);
  return true;
}

export async function getMarkets(): Promise<Market[]> {
  const db = await readDb();
  return db.markets;
}

export async function getMarket(id: string): Promise<Market | undefined> {
  const db = await readDb();
  return db.markets.find(m => m.id === id);
}

export async function createMarket(market: Omit<Market, 'id' | 'createdAt' | 'resolved' | 'outcome' | 'yesPool' | 'noPool'>): Promise<Market> {
  const db = await readDb();
  const newMarket: Market = {
    ...market,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    resolved: false,
    outcome: null,
    yesPool: 50,
    noPool: 50,
  };
  db.markets.push(newMarket);
  await writeDb(db);
  return newMarket;
}

export async function placeBet(userId: string, marketId: string, amount: number, position: 'yes' | 'no'): Promise<{ bet: Bet; user: User; market: Market } | { error: string }> {
  const db = await readDb();

  const user = db.users.find(u => u.id === userId);
  if (!user) return { error: 'User not found' };

  const market = db.markets.find(m => m.id === marketId);
  if (!market) return { error: 'Market not found' };

  if (market.resolved) return { error: 'Market is already resolved' };
  if (amount <= 0) return { error: 'Amount must be positive' };
  if (amount > user.balance) return { error: 'Insufficient balance' };

  user.balance -= amount;

  if (position === 'yes') {
    market.yesPool += amount;
  } else {
    market.noPool += amount;
  }

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
  db.bets.push(bet);

  await writeDb(db);
  return { bet, user, market };
}

export async function resolveMarket(marketId: string, outcome: boolean): Promise<Market | { error: string }> {
  const db = await readDb();

  const market = db.markets.find(m => m.id === marketId);
  if (!market) return { error: 'Market not found' };
  if (market.resolved) return { error: 'Market already resolved' };

  market.resolved = true;
  market.outcome = outcome;

  const winningPosition = outcome ? 'yes' : 'no';
  const totalPool = market.yesPool + market.noPool;

  const marketBets = db.bets.filter(b => b.marketId === marketId && b.position === winningPosition);
  const winningPool = outcome ? market.yesPool : market.noPool;

  for (const bet of marketBets) {
    const user = db.users.find(u => u.id === bet.oddsDirection);
    if (user) {
      const share = bet.amount / winningPool;
      user.balance += share * totalPool;
    }
  }

  await writeDb(db);
  return market;
}

export async function getUserBets(userId: string): Promise<Bet[]> {
  const db = await readDb();
  return db.bets.filter(b => b.userId === userId);
}
