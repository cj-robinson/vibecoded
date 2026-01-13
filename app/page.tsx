'use client';

import { useState, useEffect } from 'react';
import { User, Market } from '@/lib/types';

function formatTimeLeft(endsAt: string): string {
  const end = new Date(endsAt);
  const now = new Date();
  const diff = end.getTime() - now.getTime();

  if (diff <= 0) return 'Ended';

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h left`;

  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${minutes}m left`;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function hasMarketEnded(endsAt: string): boolean {
  const end = new Date(endsAt);
  const now = new Date();
  return now.getTime() >= end.getTime();
}

interface BetWithUser {
  id: string;
  userName: string;
  amount: number;
  position: 'yes' | 'no';
  createdAt: string;
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState('');
  const [markets, setMarkets] = useState<Market[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [betAmounts, setBetAmounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [expandedMarket, setExpandedMarket] = useState<string | null>(null);
  const [marketBets, setMarketBets] = useState<Record<string, BetWithUser[]>>({});
  const [resolveModal, setResolveModal] = useState<{ marketId: string; outcome: boolean } | null>(null);
  const [activeTab, setActiveTab] = useState<'markets' | 'leaderboard'>('markets');

  // New market form
  const [newMarket, setNewMarket] = useState({
    title: '',
    description: '',
    endsAt: '',
  });

  useEffect(() => {
    const savedUser = localStorage.getItem('dbe-bets-user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    fetchMarkets();
    fetchUsers();
  }, []);

  const fetchMarkets = async () => {
    try {
      const res = await fetch('/api/markets');
      const data = await res.json();
      setMarkets(data);
    } catch (error) {
      console.error('Failed to fetch markets:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      setUsers(data);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };

  const refreshUser = async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/users?name=${encodeURIComponent(user.name)}`);
      if (res.ok) {
        const updatedUser = await res.json();
        setUser(updatedUser);
        localStorage.setItem('dbe-bets-user', JSON.stringify(updatedUser));
      }
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: username.trim() }),
      });
      const newUser = await res.json();
      setUser(newUser);
      localStorage.setItem('dbe-bets-user', JSON.stringify(newUser));
    } catch (error) {
      console.error('Login failed:', error);
    }
    setLoading(false);
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('dbe-bets-user');
  };

  const handleCreateMarket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newMarket.title || !newMarket.description || !newMarket.endsAt) return;

    setLoading(true);
    try {
      // Convert datetime-local format to ISO string
      const endsAtISO = new Date(newMarket.endsAt).toISOString();

      const res = await fetch('/api/markets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          title: newMarket.title,
          description: newMarket.description,
          endsAt: endsAtISO,
          createdBy: user.name,
        }),
      });

      if (res.ok) {
        setShowCreateModal(false);
        setNewMarket({ title: '', description: '', endsAt: '' });
        fetchMarkets();
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to create market');
      }
    } catch (error) {
      console.error('Failed to create market:', error);
      alert('Failed to create market. Please try again.');
    }
    setLoading(false);
  };

  const fetchMarketBets = async (marketId: string) => {
    try {
      const res = await fetch(`/api/markets?bets=${marketId}`);
      const bets = await res.json();
      setMarketBets({ ...marketBets, [marketId]: bets });
    } catch (error) {
      console.error('Failed to fetch bets:', error);
    }
  };

  const toggleBetsDropdown = (marketId: string) => {
    if (expandedMarket === marketId) {
      setExpandedMarket(null);
    } else {
      setExpandedMarket(marketId);
      if (!marketBets[marketId]) {
        fetchMarketBets(marketId);
      }
    }
  };

  const handleBet = async (marketId: string, position: 'yes' | 'no') => {
    if (!user) return;

    const amount = parseFloat(betAmounts[marketId] || '0');
    if (amount <= 0 || amount > user.balance) return;

    setLoading(true);
    try {
      const res = await fetch('/api/markets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bet',
          userId: user.id,
          marketId,
          amount,
          position,
        }),
      });

      if (res.ok) {
        setBetAmounts({ ...betAmounts, [marketId]: '' });
        // Clear cached bets for this market
        if (marketBets[marketId]) {
          setMarketBets({ ...marketBets, [marketId]: [] });
        }
        await Promise.all([fetchMarkets(), refreshUser()]);
        // Refetch bets if dropdown is open
        if (expandedMarket === marketId) {
          fetchMarketBets(marketId);
        }
      } else {
        const error = await res.json();
        alert(error.error || 'Bet failed');
      }
    } catch (error) {
      console.error('Bet failed:', error);
    }
    setLoading(false);
  };

  const handleResolveMarket = async () => {
    if (!resolveModal) return;

    setLoading(true);
    try {
      const res = await fetch('/api/markets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'resolve',
          marketId: resolveModal.marketId,
          outcome: resolveModal.outcome,
        }),
      });

      if (res.ok) {
        setResolveModal(null);
        await Promise.all([fetchMarkets(), fetchUsers(), refreshUser()]);
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to resolve market');
      }
    } catch (error) {
      console.error('Resolve failed:', error);
    }
    setLoading(false);
  };

  if (!user) {
    return (
      <div className="login-container">
        <div className="login-box">
          <h1 className="login-title">DBE Bets</h1>
          <p className="login-subtitle">Prediction markets for friends</p>

          <form onSubmit={handleLogin}>
            <div className="input-group">
              <label className="input-label">Your Name</label>
              <input
                type="text"
                className="input"
                placeholder="Enter your name..."
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Loading...' : 'Enter'}
            </button>
          </form>

          <p style={{ marginTop: '24px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            New users start with $100
          </p>
        </div>
      </div>
    );
  }

  const getOdds = (market: Market) => {
    const total = market.yesPool + market.noPool;
    const yesPercent = Math.round((market.yesPool / total) * 100);
    const noPercent = 100 - yesPercent;
    return { yesPercent, noPercent };
  };

  return (
    <>
      <header className="header">
        <div className="container header-content">
          <div className="logo">DBE Bets</div>
          <div className="user-info">
            <span className="username">{user.name}</span>
            <span className="balance">{user.balance.toFixed(0)}</span>
            <button className="logout-btn" onClick={handleLogout}>Logout</button>
          </div>
        </div>
      </header>

      <main className="container markets-page">
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'markets' ? 'active' : ''}`}
            onClick={() => setActiveTab('markets')}
          >
            Markets
          </button>
          <button
            className={`tab ${activeTab === 'leaderboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('leaderboard')}
          >
            Leaderboard
          </button>
        </div>

        {activeTab === 'markets' && (
          <>
            <div className="page-header">
              <h1 className="page-title">Markets</h1>
              <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
                + New Market
              </button>
            </div>

            {markets.length === 0 ? (
          <div className="empty-state">
            <h3>No markets yet</h3>
            <p>Create the first one!</p>
          </div>
        ) : (
          markets.map((market) => {
            const { yesPercent, noPercent } = getOdds(market);
            const totalVolume = market.yesPool + market.noPool;

            return (
              <div key={market.id} className="market-card">
                <div className="market-header">
                  <h2 className="market-title">{market.title}</h2>
                  <span className={`market-status ${market.resolved ? 'resolved' : 'active'}`}>
                    {market.resolved ? (market.outcome ? 'Yes' : 'No') : 'Active'}
                  </span>
                </div>

                <p className="market-description">{market.description}</p>

                <div className="market-odds">
                  <div
                    className="odds-bar odds-yes"
                    style={{ flex: yesPercent, minWidth: '60px' }}
                  >
                    Yes {yesPercent}%
                  </div>
                  <div
                    className="odds-bar odds-no"
                    style={{ flex: noPercent, minWidth: '60px' }}
                  >
                    No {noPercent}%
                  </div>
                </div>

                <div className="market-meta">
                  <span className="market-volume">${totalVolume} pool</span>
                  <span className="market-deadline">
                    <span className="timeline-dot"></span>
                    {formatDate(market.createdAt)} — {formatTimeLeft(market.endsAt)}
                  </span>
                </div>

                <button
                  className="bets-toggle"
                  onClick={() => toggleBetsDropdown(market.id)}
                >
                  {expandedMarket === market.id ? '▼' : '▶'} View Bets
                </button>

                {expandedMarket === market.id && (
                  <div className="bets-dropdown">
                    {!marketBets[market.id] ? (
                      <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</p>
                    ) : marketBets[market.id].length === 0 ? (
                      <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No bets yet</p>
                    ) : (
                      <div className="bets-list">
                        {marketBets[market.id].map((bet) => (
                          <div key={bet.id} className="bet-item">
                            <span className="bet-user">{bet.userName}</span>
                            <span className={`bet-position ${bet.position}`}>
                              {bet.position === 'yes' ? '👍' : '👎'} {bet.position.toUpperCase()}
                            </span>
                            <span className="bet-amount">${bet.amount}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {!market.resolved && (
                  <>
                    {!hasMarketEnded(market.endsAt) && (
                      <>
                        <div className="bet-section">
                          <input
                            type="number"
                            className="bet-input"
                            placeholder="$"
                            min="1"
                            max={user.balance}
                            value={betAmounts[market.id] || ''}
                            onChange={(e) => setBetAmounts({ ...betAmounts, [market.id]: e.target.value })}
                          />
                          <button
                            className="btn btn-yes btn-sm"
                            onClick={() => handleBet(market.id, 'yes')}
                            disabled={loading || !betAmounts[market.id]}
                          >
                            Bet Yes
                          </button>
                          <button
                            className="btn btn-no btn-sm"
                            onClick={() => handleBet(market.id, 'no')}
                            disabled={loading || !betAmounts[market.id]}
                          >
                            Bet No
                          </button>
                        </div>

                        {betAmounts[market.id] && parseFloat(betAmounts[market.id]) > 0 && (
                          <div className="potential-payout">
                            <span className="payout-yes">
                              Yes wins: <strong>${((parseFloat(betAmounts[market.id]) / (market.yesPool + parseFloat(betAmounts[market.id]))) * (totalVolume + parseFloat(betAmounts[market.id]))).toFixed(2)}</strong>
                            </span>
                            <span className="payout-no">
                              No wins: <strong>${((parseFloat(betAmounts[market.id]) / (market.noPool + parseFloat(betAmounts[market.id]))) * (totalVolume + parseFloat(betAmounts[market.id]))).toFixed(2)}</strong>
                            </span>
                          </div>
                        )}
                      </>
                    )}

                    {hasMarketEnded(market.endsAt) && (
                      <div className="resolve-section">
                        <button
                          className="btn btn-resolve btn-yes"
                          onClick={() => setResolveModal({ marketId: market.id, outcome: true })}
                          disabled={loading}
                        >
                          Resolve YES
                        </button>
                        <button
                          className="btn btn-resolve btn-no"
                          onClick={() => setResolveModal({ marketId: market.id, outcome: false })}
                          disabled={loading}
                        >
                          Resolve NO
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })
        )}
          </>
        )}

        {activeTab === 'leaderboard' && (
          <>
            <div className="page-header">
              <h1 className="page-title">Leaderboard</h1>
            </div>

            {users.length === 0 ? (
              <div className="empty-state">
                <h3>No users yet</h3>
                <p>Be the first to join!</p>
              </div>
            ) : (
              <div className="leaderboard">
                {users
                  .sort((a, b) => b.balance - a.balance)
                  .map((u, index) => (
                    <div key={u.id} className={`leaderboard-item ${u.id === user?.id ? 'current-user' : ''}`}>
                      <div className="rank">
                        {index === 0 && '🥇'}
                        {index === 1 && '🥈'}
                        {index === 2 && '🥉'}
                        {index > 2 && `#${index + 1}`}
                      </div>
                      <div className="leaderboard-user">
                        <span className="user-name">{u.name}</span>
                        {u.id === user?.id && <span className="you-badge">You</span>}
                      </div>
                      <div className="leaderboard-balance">${u.balance.toFixed(0)}</div>
                    </div>
                  ))}
              </div>
            )}
          </>
        )}
      </main>

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Create New Market</h2>

            <form onSubmit={handleCreateMarket}>
              <div className="form-group">
                <label className="form-label">Question</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Will something happen?"
                  value={newMarket.title}
                  onChange={(e) => setNewMarket({ ...newMarket, title: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  className="form-input form-textarea"
                  placeholder="Describe the resolution criteria..."
                  value={newMarket.description}
                  onChange={(e) => setNewMarket({ ...newMarket, description: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">End Date</label>
                <input
                  type="datetime-local"
                  className="form-input"
                  value={newMarket.endsAt}
                  onChange={(e) => setNewMarket({ ...newMarket, endsAt: e.target.value })}
                />
              </div>

              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Creating...' : 'Create Market'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resolveModal && (
        <div className="modal-overlay" onClick={() => setResolveModal(null)}>
          <div className="modal resolve-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Resolve Market</h2>
            <p style={{ marginBottom: '24px', color: 'var(--text-secondary)' }}>
              You're about to resolve this market as <strong>{resolveModal.outcome ? 'YES' : 'NO'}</strong>.
              This will distribute winnings to all winning bettors and cannot be undone.
            </p>
            <p style={{ marginBottom: '24px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Make sure you're ready to end this market permanently!
            </p>
            <div className="form-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setResolveModal(null)}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleResolveMarket}
                disabled={loading}
              >
                {loading ? 'Resolving...' : 'Confirm & Resolve'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
