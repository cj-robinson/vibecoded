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

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState('');
  const [markets, setMarkets] = useState<Market[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [betAmounts, setBetAmounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  // New market form
  const [newMarket, setNewMarket] = useState({
    title: '',
    description: '',
    endsAt: '',
  });

  useEffect(() => {
    const savedUser = localStorage.getItem('friendbets-user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    fetchMarkets();
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

  const refreshUser = async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/users?name=${encodeURIComponent(user.name)}`);
      if (res.ok) {
        const updatedUser = await res.json();
        setUser(updatedUser);
        localStorage.setItem('friendbets-user', JSON.stringify(updatedUser));
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
      localStorage.setItem('friendbets-user', JSON.stringify(newUser));
    } catch (error) {
      console.error('Login failed:', error);
    }
    setLoading(false);
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('friendbets-user');
  };

  const handleCreateMarket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newMarket.title || !newMarket.description || !newMarket.endsAt) return;

    setLoading(true);
    try {
      const res = await fetch('/api/markets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          ...newMarket,
          createdBy: user.name,
        }),
      });

      if (res.ok) {
        setShowCreateModal(false);
        setNewMarket({ title: '', description: '', endsAt: '' });
        fetchMarkets();
      }
    } catch (error) {
      console.error('Failed to create market:', error);
    }
    setLoading(false);
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
        await Promise.all([fetchMarkets(), refreshUser()]);
      } else {
        const error = await res.json();
        alert(error.error || 'Bet failed');
      }
    } catch (error) {
      console.error('Bet failed:', error);
    }
    setLoading(false);
  };

  if (!user) {
    return (
      <div className="login-container">
        <div className="login-box">
          <h1 className="login-title">Friend<span>Bets</span></h1>
          <p className="login-subtitle">Bet on life events with your friends</p>

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
          <div className="logo">Friend<span>Bets</span></div>
          <div className="user-info">
            <span className="username">{user.name}</span>
            <span className="balance">{user.balance.toFixed(0)}</span>
            <button className="logout-btn" onClick={handleLogout}>Logout</button>
          </div>
        </div>
      </header>

      <main className="container markets-page">
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

                {!market.resolved && (
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
                )}
              </div>
            );
          })
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
    </>
  );
}
