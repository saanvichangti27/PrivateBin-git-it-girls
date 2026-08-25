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
        <div className="animate-pulse text-custom-textSecondary text-sm tracking-widest uppercase">Loading analytics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-custom-card border border-custom-border rounded-lg p-10 shadow-sm text-center max-w-lg mx-auto">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-custom-destructive/10 text-custom-destructive rounded-full mb-6">
          <ShieldAlert size={32} strokeWidth={1.5} />
        </div>
        <h2 className="text-2xl font-semibold text-custom-textPrimary mb-3">Access Denied</h2>
        <p className="text-custom-textSecondary mb-8 text-sm">{error}</p>
        <Link to="/" className="text-blue-600 hover:text-blue-500 font-medium transition-colors text-sm uppercase tracking-wide">
          Return Home &rarr;
        </Link>
      </div>
    );
  }

  const isLocked = analytics?.status === 'locked';
  const hasSuspiciousActivity = analytics?.failed_attempts > 0 || isLocked;

  return (
    <div className="animate-in fade-in zoom-in-95 duration-300 max-w-4xl mx-auto">
      <div className="bg-custom-card border border-custom-border rounded-lg p-6 sm:p-10 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)] mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-10 gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-lg font-semibold text-custom-textPrimary tracking-tight">
                Security Dashboard
              </h2>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest ${isLocked ? 'bg-custom-destructive/10 text-custom-destructive border border-custom-destructive/30' : 'bg-custom-accent/10 text-custom-accent border border-custom-accent/30'}`}>
                {analytics.status}
              </span>
            </div>
            <p className="text-custom-textSecondary text-sm flex items-center gap-2">
              <span className="uppercase tracking-widest text-[10px] font-semibold text-custom-textSecondary">ID</span> 
              <span className="font-mono text-gray-600 bg-custom-bg px-2 py-0.5 rounded border border-custom-border text-xs">{analytics.id}</span>
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {isLocked && (
              <button
                onClick={handleUnlock}
                disabled={isUnlocking || isBurning}
                className="flex items-center gap-2 bg-custom-card hover:bg-custom-bg text-custom-textPrimary px-4 py-2 rounded-md transition-colors text-xs font-bold uppercase tracking-wider border border-custom-border shadow-sm"
              >
                <Unlock size={14} strokeWidth={2} />
                {isUnlocking ? 'Unlocking...' : 'Unlock'}
              </button>
            )}
            <button
              onClick={fetchAnalytics}
              disabled={isLoading}
              className="flex items-center justify-center bg-custom-card hover:bg-custom-bg text-custom-textSecondary px-3 py-2 rounded-md transition-colors border border-custom-border shadow-sm"
              title="Refresh Analytics"
            >
              <RefreshCcw size={14} className={isLoading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={handleBurn}
              disabled={isBurning}
              className="flex items-center gap-2 bg-custom-card hover:bg-custom-destructive/10 text-custom-destructive px-4 py-2 rounded-md transition-colors text-xs font-bold uppercase tracking-wider border border-custom-destructive/30 hover:border-custom-destructive/50 shadow-sm"
            >
              <Trash2 size={14} strokeWidth={2} />
              {isBurning ? 'Burning...' : 'Burn Secret'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-custom-bg border border-custom-border rounded-lg p-5">
            <div className="flex items-center gap-2 text-custom-textSecondary mb-3">
              <Users size={14} strokeWidth={2.5} />
              <h3 className="text-[10px] font-bold uppercase tracking-widest">Total Views</h3>
            </div>
            <p className="text-xl font-semibold text-custom-textPrimary">{analytics.total_views}</p>
          </div>
          <div className="bg-custom-bg border border-custom-border rounded-lg p-5">
            <div className="flex items-center gap-2 text-custom-textSecondary mb-3">
              <Users size={14} strokeWidth={2.5} />
              <h3 className="text-[10px] font-bold uppercase tracking-widest">Views Remaining</h3>
            </div>
            <p className="text-xl font-semibold text-custom-textPrimary">
              {analytics.remaining_views === null ? 'Unlimited' : analytics.remaining_views}
            </p>
          </div>
          <div className="bg-custom-bg border border-custom-border rounded-lg p-5">
            <div className="flex items-center gap-2 text-custom-textSecondary mb-3">
              <Clock size={14} strokeWidth={2.5} />
              <h3 className="text-[10px] font-bold uppercase tracking-widest">Time Remaining</h3>
            </div>
            <p className="text-xl font-semibold text-custom-textPrimary">
              {timeRemaining}
            </p>
          </div>
          <div className="bg-custom-bg border border-custom-border rounded-lg p-5">
            <div className="flex items-center gap-2 text-custom-textSecondary mb-3">
              <ShieldAlert size={14} strokeWidth={2.5} />
              <h3 className="text-[10px] font-bold uppercase tracking-widest">Suspicious Activity</h3>
            </div>
            <p className={`text-xl font-semibold ${hasSuspiciousActivity ? 'text-custom-destructive' : 'text-custom-accent'}`}>
              {hasSuspiciousActivity ? 'Detected' : 'None'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
