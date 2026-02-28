import React, { useState } from 'react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (token: string, user: any) => void;
  theme: 'color' | 'day' | 'night';
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess, theme }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [mobile, setMobile] = useState('');
  const [accountType, setAccountType] = useState<'personal' | 'team'>('personal');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
    const body = isLogin ? { email, password } : { email, password, companyName, accountType, mobile };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Le serveur a renvoyé une réponse invalide (HTML au lieu de JSON). Veuillez réessayer dans quelques instants.');
      }

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Une erreur est survenue');

      onSuccess(data.token, data.user);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const bgClass = theme === 'night' ? 'bg-[#1a1a1a] text-white border-white/10' : 'bg-white text-black border-black/5';
  const inputClass = theme === 'night' ? 'bg-[#333] border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-black';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className={`w-full max-w-md p-6 rounded-2xl shadow-2xl border ${bgClass}`}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold uppercase tracking-tight">
            {isLogin ? 'Connexion' : 'Créer un compte'}
          </h2>
          <button onClick={onClose} className="opacity-50 hover:opacity-100 transition-opacity">
            <i className="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 text-xs font-bold bg-red-500/10 text-red-500 rounded-lg border border-red-500/20">
              {error}
            </div>
          )}

          {!isLogin && (
            <>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase opacity-50 ml-1">Société / Équipe</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className={`w-full p-3 rounded-xl border outline-none text-sm font-bold ${inputClass}`}
                  placeholder="Nom de la société"
                  required={!isLogin}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase opacity-50 ml-1">Numéro Mobile</label>
                <input
                  type="tel"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  className={`w-full p-3 rounded-xl border outline-none text-sm font-bold ${inputClass}`}
                  placeholder="034 00 000 00"
                  required={!isLogin}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase opacity-50 ml-1">Type de compte</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAccountType('personal')}
                    className={`flex-1 py-2 rounded-lg text-[10px] font-bold border transition-all ${accountType === 'personal' ? 'bg-blue-500 text-white border-blue-500' : 'bg-transparent opacity-40 border-gray-300'}`}
                  >PERSONNEL (1 SEUL)</button>
                  <button
                    type="button"
                    onClick={() => setAccountType('team')}
                    className={`flex-1 py-2 rounded-lg text-[10px] font-bold border transition-all ${accountType === 'team' ? 'bg-blue-500 text-white border-blue-500' : 'bg-transparent opacity-40 border-gray-300'}`}
                  >ÉQUIPE (JUSQU'À 5)</button>
                </div>
              </div>
            </>
          )}

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase opacity-50 ml-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`w-full p-3 rounded-xl border outline-none text-sm font-bold ${inputClass}`}
              placeholder="votre@email.com"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase opacity-50 ml-1">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`w-full p-3 rounded-xl border outline-none text-sm font-bold ${inputClass}`}
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3 rounded-xl font-bold text-sm uppercase tracking-widest transition-all active:scale-95 shadow-lg ${
              loading ? 'opacity-50 cursor-not-allowed' : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
          >
            {loading ? 'Chargement...' : isLogin ? 'Se connecter' : "S'inscrire"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-xs font-bold opacity-50 hover:opacity-100 transition-opacity uppercase tracking-tighter"
          >
            {isLogin ? "Pas encore de compte ? S'inscrire" : "Déjà un compte ? Se connecter"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
