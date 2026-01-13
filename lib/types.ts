export interface User {
  id: string;
  name: string;
  balance: number;
  createdAt: string;
}

export interface Market {
  id: string;
  title: string;
  description: string;
  createdBy: string;
  createdAt: string;
  endsAt: string;
  resolved: boolean;
  outcome: boolean | null;
  yesPool: number;
  noPool: number;
}

export interface Bet {
  id: string;
  oddsAtBet: number;
  oddsDirection: 'yes' | 'no';
  userId: string;
  marketId: string;
  amount: number;
  position: 'yes' | 'no';
  createdAt: string;
}

export interface Database {
  users: User[];
  markets: Market[];
  bets: Bet[];
}
