import React, { useEffect, useState } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { getAnalytics, unlockPaste, deletePaste } from '../lib/api';
import { BarChart2, ShieldAlert, CheckCircle2, Clock, Users, Unlock, Trash2, RefreshCcw } from 'lucide-react';

export default function Dashboard({ pasteId, adminTokenProp }) {
  const { id: urlId } = useParams();
  const location = useLocation();
  const urlToken = location.hash.replace('#', '');
  
  const id = pasteId || urlId;
  const adminToken = adminTokenProp || urlToken;
  
  const [analytics, setAnalytics] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState('...');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isBurning, setIsBurning] = useState(false);

  const fetchAnalytics = async () => {
    try {
      const data = await getAnalytics(id, adminToken);
      setAnalytics(data);
    } catch (err) {
      setError(err.message || 'Failed to load analytics.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!adminToken) {
      setError('Creator verification failed. The dashboard is only available immediately after creating a secret in this session.');
      setIsLoading(false);
      return;
    }
    fetchAnalytics();
  }, [id, adminToken]);

  useEffect(() => {
    if (!analytics) return;
    if (!analytics.expires_at) {
      setTimeRemaining('Never');
      return;
    }

    const updateTime = () => {
      const now = new Date();
      const expires = new Date(analytics.expires_at);
      const diff = expires - now;

      if (diff <= 0) {
        setTimeRemaining('Expired');
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const mins = Math.floor((diff / 1000 / 60) % 60);

      let parts = [];
      if (days > 0) parts.push(`${days}d`);
      if (hours > 0) parts.push(`${hours}h`);
      if (mins > 0) parts.push(`${mins}m`);
      if (parts.length === 0) {
        const secs = Math.floor(diff / 1000);
        parts.push(`${secs}s`);
      }
      setTimeRemaining(parts.join(' '));
    };

    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, [analytics]);

  const handleUnlock = async () => {
    try {
      setIsUnlocking(true);
      await unlockPaste(id, adminToken);
      await fetchAnalytics(); // Refresh
    } catch (err) {
      alert("Failed to unlock paste.");
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleBurn = async () => {
    if (!window.confirm("Are you sure you want to permanently burn this secret? This action cannot be undone.")) {
      return;
    }
    try {
      setIsBurning(true);
      await deletePaste(id, adminToken);
      setError('This secret has been burned and is no longer available.');
      setAnalytics(null);
    } catch (err) {
      alert("Failed to burn paste.");
    } finally {
      setIsBurning(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-48">
        <div className="animate-pulse text-zinc-500 font-medium">Loading analytics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 shadow-2xl text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-red-500/10 text-red-400 rounded-full mb-6">
          <ShieldAlert size={32} />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
        <p className="text-zinc-400 mb-8">{error}</p>
        <Link to="/" className="text-emerald-500 hover:text-emerald-400 font-medium transition-colors">
          Return Home &rarr;
        </Link>
      </div>
    );
  }

  const isLocked = analytics?.status === 'locked';
  const hasSuspiciousActivity = analytics?.failed_attempts > 0 || isLocked;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 sm:p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-300">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <BarChart2 className="text-blue-500" />
            Security Dashboard
          </h2>
          <p className="text-zinc-400 text-sm mt-1">
            Paste ID: <span className="font-mono text-zinc-300">{analytics.id}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${isLocked ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
            {analytics.status}
          </span>
          {isLocked && (
            <button
              onClick={handleUnlock}
              disabled={isUnlocking || isBurning}
              className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1.5 rounded-md transition-colors text-sm font-medium border border-zinc-700"
            >
              <Unlock size={14} />
              {isUnlocking ? 'Unlocking...' : 'Unlock'}
            </button>
          )}
          <button
            onClick={fetchAnalytics}
            disabled={isLoading}
            className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1.5 rounded-md transition-colors text-sm font-medium border border-zinc-700"
            title="Refresh Analytics"
          >
            <RefreshCcw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={handleBurn}
            disabled={isBurning}
            className="flex items-center gap-1.5 bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded-md transition-colors text-sm font-medium border border-red-700 shadow-[0_0_15px_rgba(220,38,38,0.3)]"
          >
            <Trash2 size={14} />
            {isBurning ? 'Burning...' : 'Burn Secret'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-zinc-400 mb-2">
            <Users size={16} />
            <h3 className="text-sm font-semibold uppercase tracking-wider">Total Views</h3>
          </div>
          <p className="text-3xl font-bold text-white">{analytics.total_views}</p>
        </div>
        <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-zinc-400 mb-2">
            <Users size={16} />
            <h3 className="text-sm font-semibold uppercase tracking-wider">Views Remaining</h3>
          </div>
          <p className="text-3xl font-bold text-white">
            {analytics.remaining_views === null ? 'Unlimited' : analytics.remaining_views}
          </p>
        </div>
        <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-zinc-400 mb-2">
            <Clock size={16} />
            <h3 className="text-sm font-semibold uppercase tracking-wider">Time Remaining</h3>
          </div>
          <p className="text-3xl font-bold text-white">
            {timeRemaining}
          </p>
        </div>
        <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-zinc-400 mb-2">
            <ShieldAlert size={16} />
            <h3 className="text-sm font-semibold uppercase tracking-wider">Suspicious Activity</h3>
          </div>
          <p className={`text-3xl font-bold ${hasSuspiciousActivity ? 'text-red-400' : 'text-emerald-400'}`}>
            {hasSuspiciousActivity ? 'Detected' : 'None'}
          </p>
        </div>
      </div>
    </div>
  );
}
