import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom';
import { getAnalytics, toggleLock, deletePaste } from '../lib/api';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Lock,
  Unlock,
  Trash2,
  RefreshCw,
  Eye,
  AlertTriangle,
  Clock,
  Flame,
  Copy,
  Check,
  ExternalLink,
  ArrowLeft,
  KeyRound,
  Activity,
  Smartphone,
  Globe,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';

const COLORS = ['#10b981', '#f59e0b', '#3b82f6', '#8b5cf6', '#ef4444', '#6b7280'];

export default function Dashboard() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const tokenParam = searchParams.get('token') || '';
  const [token, setToken] = useState(tokenParam);
  const [tokenInput, setTokenInput] = useState('');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedDashLink, setCopiedDashLink] = useState(false);

  const fetchDashboardData = useCallback(async (currentToken) => {
    if (!currentToken) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await getAnalytics(id, currentToken);
      setData(res);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to load security dashboard.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (tokenParam) {
      setToken(tokenParam);
      fetchDashboardData(tokenParam);
    } else {
      setLoading(false);
    }
  }, [tokenParam, fetchDashboardData]);

  const handleTokenSubmit = (e) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;
    setToken(tokenInput.trim());
    setSearchParams({ token: tokenInput.trim() });
    fetchDashboardData(tokenInput.trim());
  };

  const handleToggleLock = async () => {
    if (!token || !data) return;
    setActionLoading(true);
    try {
      const res = await toggleLock(id, token);
      setData((prev) => ({
        ...prev,
        is_locked: res.is_locked,
        status: res.is_locked ? 'locked' : (prev.status === 'locked' ? 'active' : prev.status),
      }));
      // Refresh full logs after state change
      fetchDashboardData(token);
    } catch (err) {
      alert(err.message || 'Failed to toggle lock.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to permanently delete this secret and all access logs? This cannot be undone.')) {
      return;
    }

    setActionLoading(true);
    try {
      await deletePaste(id, token);
      alert('Secret and access logs have been permanently destroyed.');
      navigate('/');
    } catch (err) {
      alert(err.message || 'Failed to delete secret.');
    } finally {
      setActionLoading(false);
    }
  };

  const copyToClipboard = (text, setter) => {
    navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Active & Secure
          </span>
        );
      case 'locked':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Lock size={12} />
            Locked (Protection Mode)
          </span>
        );
      case 'burned':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
            <Flame size={12} />
            Destroyed / Burned
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-zinc-700/30 text-zinc-400 border border-zinc-700/50">
            <Clock size={12} />
            Expired (TTL Exhausted)
          </span>
        );
      default:
        return <span className="text-zinc-400 text-xs">{status}</span>;
    }
  };

  const getEventBadge = (type) => {
    if (type.includes('CREATED')) {
      return <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">Created</span>;
    }
    if (type.includes('VIEWED')) {
      return <span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Viewed</span>;
    }
    if (type.includes('FAILED')) {
      return <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">Failed Code</span>;
    }
    if (type.includes('LOCKED')) {
      return <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">Locked</span>;
    }
    if (type.includes('UNLOCKED')) {
      return <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">Unlocked</span>;
    }
    if (type.includes('BURNED')) {
      return <span className="px-2 py-0.5 rounded text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">Burned</span>;
    }
    return <span className="px-2 py-0.5 rounded text-xs font-medium bg-zinc-800 text-zinc-300">{type}</span>;
  };

  const secretLink = `${window.location.origin}/view/${id}`;
  const dashboardLink = window.location.href;

  // Render Token Entry Screen if token is missing
  if (!token) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 shadow-2xl max-w-md mx-auto animate-in fade-in zoom-in-95">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-full mb-3">
            <KeyRound size={24} />
          </div>
          <h2 className="text-2xl font-bold text-white mb-1">Creator Security Access</h2>
          <p className="text-zinc-400 text-sm">
            Enter the Creator Management Token provided during paste creation to view security analytics and manage this link.
          </p>
        </div>

        <form onSubmit={handleTokenSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              Creator Token
            </label>
            <input
              type="text"
              autoFocus
              required
              placeholder="e.g. i5CdrcUKa3KYL6fp..."
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 font-mono text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
          >
            Access Security Dashboard
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-zinc-800 text-center">
          <Link to="/" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
            &larr; Back to Secret Creator
          </Link>
        </div>
      </div>
    );
  }

  // Loading State
  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center h-64 gap-3">
        <RefreshCw size={28} className="animate-spin text-emerald-500" />
        <span className="text-zinc-400 text-sm font-medium">Loading telemetry & security logs...</span>
      </div>
    );
  }

  // Error State
  if (error) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 shadow-2xl text-center max-w-md mx-auto">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-red-500/10 text-red-400 rounded-full mb-4">
          <AlertTriangle size={28} />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
        <p className="text-zinc-400 text-sm mb-6">{error}</p>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => { setToken(''); setSearchParams({}); }}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 py-2 rounded-lg text-sm transition-colors"
          >
            Enter Different Token
          </button>
          <Link to="/" className="text-xs text-zinc-500 hover:text-zinc-300">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Bar Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <Link to="/" className="p-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-lg border border-zinc-800 transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-white">Security & Access Dashboard</h2>
              <span className="font-mono text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded">ID: {id}</span>
            </div>
            <p className="text-xs text-zinc-400">Live telemetry, tamper detection, and emergency controls</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchDashboardData(token)}
            disabled={actionLoading}
            className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={handleToggleLock}
            disabled={actionLoading}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
              data?.is_locked
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                : 'bg-zinc-900 hover:bg-zinc-800 text-amber-400 border border-amber-500/30'
            }`}
          >
            {data?.is_locked ? <Unlock size={14} /> : <Lock size={14} />}
            {data?.is_locked ? 'Unlock Link' : 'Emergency Lock'}
          </button>
          <button
            onClick={handleDelete}
            disabled={actionLoading}
            className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors"
          >
            <Trash2 size={14} />
            Destroy Now
          </button>
        </div>
      </div>

      {/* Overview Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Status */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-sm">
          <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>Link Status</span>
            <Shield size={16} className="text-zinc-500" />
          </div>
          <div className="mt-1">{getStatusBadge(data?.status)}</div>
        </div>

        {/* Views */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-sm">
          <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>Views Served</span>
            <Eye size={16} className="text-zinc-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{data?.total_views || 0}</span>
            <span className="text-xs text-zinc-500">
              {data?.max_views ? `/ ${data.max_views} max (${data.remaining_views} left)` : '(Unlimited)'}
            </span>
          </div>
        </div>

        {/* Failed Attempts / Tampering */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-sm">
          <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>Failed Decryptions</span>
            <ShieldAlert size={16} className="text-zinc-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${data?.failed_attempts > 0 ? 'text-red-400' : 'text-zinc-100'}`}>
              {data?.failed_attempts || 0}
            </span>
            <span className="text-xs text-zinc-500">/ {data?.burn_threshold} threshold</span>
          </div>
        </div>

        {/* TTL / Expiration */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-sm">
          <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>Expires At</span>
            <Clock size={16} className="text-zinc-500" />
          </div>
          <div className="text-sm font-medium text-zinc-200 truncate" title={data?.expires_at}>
            {data?.expires_at ? new Date(data.expires_at).toLocaleString() : 'Never'}
          </div>
        </div>
      </div>

      {/* Share Links Quick Bar */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
              Secret Share Link (Send to recipient)
            </label>
            <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-1 pl-3">
              <span className="flex-1 font-mono text-emerald-400 text-xs overflow-hidden text-ellipsis whitespace-nowrap">
                {secretLink}
              </span>
              <button
                onClick={() => copyToClipboard(secretLink, setCopiedLink)}
                className="ml-2 flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
              >
                {copiedLink ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                {copiedLink ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
              Creator Dashboard URL (Keep private)
            </label>
            <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-1 pl-3">
              <span className="flex-1 font-mono text-zinc-400 text-xs overflow-hidden text-ellipsis whitespace-nowrap">
                {dashboardLink}
              </span>
              <button
                onClick={() => copyToClipboard(dashboardLink, setCopiedDashLink)}
                className="ml-2 flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
              >
                {copiedDashLink ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                {copiedDashLink ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Analytics Visualization Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Views Over Time Line Chart */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-sm">
          <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-4 flex items-center justify-between">
            <span>Views Over Time</span>
            <Activity size={16} className="text-zinc-500" />
          </div>
          <div className="h-64">
            {data?.views_over_time?.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.views_over_time}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="date" stroke="#a1a1aa" fontSize={12} tickMargin={10} />
                  <YAxis stroke="#a1a1aa" fontSize={12} allowDecimals={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', color: '#f4f4f5' }}
                    itemStyle={{ color: '#10b981' }}
                  />
                  <Line type="monotone" dataKey="views" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981' }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
                No view data available yet.
              </div>
            )}
          </div>
        </div>

        {/* Device Breakdown Pie Chart */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-sm">
          <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-4 flex items-center justify-between">
            <span>Device Breakdown</span>
            <Smartphone size={16} className="text-zinc-500" />
          </div>
          <div className="h-64">
            {data?.device_breakdown?.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.device_breakdown}
                    dataKey="count"
                    nameKey="device"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                  >
                    {data.device_breakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', color: '#f4f4f5' }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', color: '#a1a1aa' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
                No device data available yet.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Access Logs Audit Trail Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
        <div className="bg-zinc-950/70 px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-zinc-200">
            <Activity size={18} className="text-emerald-400" />
            <h3 className="font-semibold text-sm tracking-wide">Audit & Access Log History</h3>
          </div>
          <span className="text-xs text-zinc-500">GDPR Compliant IP Anonymization</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-950 text-zinc-400 uppercase tracking-wider border-b border-zinc-800/80">
              <tr>
                <th className="py-3 px-4 font-semibold">Event</th>
                <th className="py-3 px-4 font-semibold">Timestamp (UTC)</th>
                <th className="py-3 px-4 font-semibold">Anonymized IP</th>
                <th className="py-3 px-4 font-semibold">Location</th>
                <th className="py-3 px-4 font-semibold">Device / User Agent</th>
                <th className="py-3 px-4 font-semibold">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800 text-zinc-300">
              {data?.access_logs?.length > 0 ? (
                data.access_logs.map((log, index) => (
                  <tr key={index} className="hover:bg-zinc-800/40 transition-colors">
                    <td className="py-3 px-4 whitespace-nowrap">{getEventBadge(log.event_type)}</td>
                    <td className="py-3 px-4 whitespace-nowrap text-zinc-400 font-mono">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-mono text-zinc-400">
                      {log.ip_hash}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-zinc-400">
                      {log.location || 'Unknown'}
                    </td>
                    <td className="py-3 px-4 max-w-xs truncate text-zinc-400" title={log.user_agent}>
                      {log.user_agent}
                    </td>
                    <td className="py-3 px-4 text-zinc-400">{log.details || '—'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-zinc-500">
                    No access events recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
