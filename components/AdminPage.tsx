import React, { useState, useEffect } from 'react';
import { User } from '../types';

interface AdminPageProps {
  token: string;
  onClose: () => void;
  theme: 'color' | 'day' | 'night';
}

const AdminPage: React.FC<AdminPageProps> = ({ token, onClose, theme }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [price, setPrice] = useState<number>(200);
  const [isUpdatingPrice, setIsUpdatingPrice] = useState(false);

  useEffect(() => {
    fetchUsers();
    fetchConfig();
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchConfig = async () => {
    try {
      const response = await fetch('/api/admin/config', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        setPrice(data.subscriptionPrice);
      }
    } catch (err) {
      console.error('Erreur config:', err);
    }
  };

  const updatePrice = async () => {
    setIsUpdatingPrice(true);
    try {
      const response = await fetch('/api/admin/update-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ price }),
      });
      if (!response.ok) throw new Error('Erreur mise à jour prix');
      alert('Prix mis à jour avec succès !');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsUpdatingPrice(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setUsers(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateSubscription = async (userId: string, action: string) => {
    if (action === '') return;
    try {
      const response = await fetch('/api/admin/update-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId, action }),
      });
      if (!response.ok) throw new Error('Erreur lors de la mise à jour');
      fetchUsers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const deleteUser = async (userId: string) => {
    if (!confirm('Supprimer cet utilisateur ?')) return;
    try {
      const response = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId }),
      });
      if (!response.ok) throw new Error('Erreur');
      fetchUsers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const toggleBlacklist = async (userId: string) => {
    try {
      const response = await fetch('/api/admin/toggle-blacklist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId }),
      });
      if (!response.ok) throw new Error('Erreur');
      fetchUsers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const formatCountdown = (endTime: number) => {
    const diff = endTime - now;
    if (diff <= 0) return 'Expiré';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);

    if (days > 0) return `${days}j ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m ${secs}s`;
  };

  const bgClass = theme === 'night' ? 'bg-[#1a1a1a] text-white' : 'bg-white text-black';
  const tableBorder = theme === 'night' ? 'border-white/10' : 'border-black/5';
  const selectClass = theme === 'night' ? 'bg-[#333] border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-black';

  return (
    <div className={`fixed inset-0 z-[110] flex flex-col ${bgClass}`}>
      <header className="p-4 border-b flex justify-between items-center shrink-0">
        <h1 className="text-xl font-black uppercase tracking-tighter">Administration MCO</h1>
        <button onClick={onClose} className="w-10 h-10 rounded-full flex items-center justify-center bg-red-500 text-white">
          <i className="fa-solid fa-xmark"></i>
        </button>
      </header>

      <main className="flex-1 overflow-auto p-4">
        {/* CONFIGURATION GLOBALE */}
        <div className={`mb-8 p-4 rounded-2xl border ${tableBorder} ${theme === 'night' ? 'bg-white/5' : 'bg-gray-50'}`}>
          <h2 className="text-xs font-bold uppercase opacity-50 mb-4">Configuration Globale</h2>
          <div className="flex items-end gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase opacity-50 ml-1">Prix de l'abonnement (Ar)</label>
              <input 
                type="number" 
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                className={`w-32 p-2 rounded-lg border outline-none text-sm font-bold ${selectClass}`}
              />
            </div>
            <button 
              onClick={updatePrice}
              disabled={isUpdatingPrice}
              className={`px-6 py-2 rounded-lg bg-blue-500 text-white text-[10px] font-bold uppercase tracking-wider shadow-lg active:scale-95 transition-all ${isUpdatingPrice ? 'opacity-50' : ''}`}
            >
              {isUpdatingPrice ? 'Mise à jour...' : 'Enregistrer le prix'}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-full">Chargement...</div>
        ) : error ? (
          <div className="text-red-500 text-center">{error}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[10px] font-bold uppercase opacity-50">
                  <th className={`p-2 border-b ${tableBorder}`}>Email</th>
                  <th className={`p-2 border-b ${tableBorder}`}>Mobile</th>
                  <th className={`p-2 border-b ${tableBorder}`}>Inscrit le</th>
                  <th className={`p-2 border-b ${tableBorder}`}>Type</th>
                  <th className={`p-2 border-b ${tableBorder}`}>Abonnement</th>
                  <th className={`p-2 border-b ${tableBorder}`}>Actions</th>
                </tr>
              </thead>
              <tbody className="text-xs">
                {users.map((u) => {
                  const subEnd = u.subscription_end || 0;
                  const isSubscribed = subEnd > now;
                  
                  return (
                    <tr key={u.id} className="hover:bg-black/5 transition-colors">
                      <td className={`p-2 border-b ${tableBorder}`}>{u.email}</td>
                      <td className={`p-2 border-b ${tableBorder}`}>{u.mobile || '-'}</td>
                      <td className={`p-2 border-b ${tableBorder}`}>{new Date(u.created_at).toLocaleDateString()}</td>
                      <td className={`p-2 border-b ${tableBorder}`}>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${u.account_type === 'team' ? 'bg-purple-500/10 text-purple-500' : 'bg-blue-500/10 text-blue-500'}`}>
                          {u.account_type}
                        </span>
                      </td>
                      <td className={`p-2 border-b ${tableBorder}`}>
                        <div className="flex flex-col gap-1">
                          <div className={`font-bold ${isSubscribed ? 'text-green-500' : 'text-red-500'}`}>
                            {isSubscribed ? formatCountdown(subEnd) : 'Bloqué'}
                          </div>
                          <select 
                            className={`text-[10px] p-1 rounded border outline-none ${selectClass}`}
                            onChange={(e) => updateSubscription(u.id, e.target.value)}
                            value=""
                          >
                            <option value="">Modifier...</option>
                            <option value="1min">Activer (1 min)</option>
                            {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                              <option key={m} value={`${m}m`}>{m} Mois</option>
                            ))}
                            <option value="couper">Couper</option>
                          </select>
                        </div>
                      </td>
                      <td className={`p-2 border-b ${tableBorder}`}>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => u.is_blacklisted && toggleBlacklist(u.id)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${!u.is_blacklisted ? 'bg-green-500 text-white shadow-[0_0_10px_rgba(34,197,94,0.3)]' : 'bg-gray-300 text-gray-500 opacity-50'}`}
                          >
                            Activé
                          </button>
                          <button 
                            onClick={() => !u.is_blacklisted && toggleBlacklist(u.id)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${u.is_blacklisted ? 'bg-black text-white shadow-[0_0_10px_rgba(0,0,0,0.3)]' : 'bg-gray-300 text-gray-500 opacity-50'}`}
                          >
                            Bloqué
                          </button>
                          <button 
                            onClick={() => deleteUser(u.id)}
                            className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                            title="Supprimer"
                          >
                            <i className="fa-solid fa-trash-can"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminPage;
