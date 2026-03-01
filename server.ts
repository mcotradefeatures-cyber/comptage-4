import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';
import { HistoryEntry, TableData } from './types';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

console.log('NODE_ENV:', process.env.NODE_ENV);

app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'comptage-mco-secret-key';

// Supabase Initialization
const supabaseUrl = process.env.SUPABASE_URL || 'https://doygmzbgtiaylwfspsdf.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRveWdtemJndGlheWx3ZnNwc2RmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzMTYxODMsImV4cCI6MjA4Nzg5MjE4M30.yYba9R9k2hl956hPr1KnLNCPPqplSaBZqKat6WtMkMg';

const supabase = createClient(supabaseUrl, supabaseKey);

// Helper to get subscription price
async function getSubscriptionPrice() {
  try {
    const { data } = await supabase.from('config').select('value').eq('key', 'subscription_price').single();
    return data ? Number(data.value) : 200;
  } catch (e) {
    return 200;
  }
}

// Seed Admin User
async function seedAdmin() {
  const adminEmail = 'admin@mco.mg';
  const { data: admin } = await supabase.from('users').select('id').eq('email', adminEmail).single();
  
  if (!admin) {
    const passwordHash = await bcrypt.hash('admin123', 10);
    const adminUser = {
      id: 'admin-1',
      email: adminEmail,
      password_hash: passwordHash,
      role: 'admin',
      account_type: 'team',
      created_at: Date.now(),
      company_name: 'ADMIN MCO'
    };
    await supabase.from('users').insert([adminUser]);
    console.log('Admin user seeded');
  }
}

seedAdmin();

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, companyName, accountType, mobile } = req.body;
    
    if (!supabaseUrl || supabaseUrl.includes('placeholder')) {
      return res.status(500).json({ error: 'Le serveur Supabase n\'est pas configuré. Veuillez ajouter SUPABASE_URL et SUPABASE_ANON_KEY dans les paramètres.' });
    }

    const { data: existingUser } = await supabase.from('users').select('id').eq('email', email).single();
    if (existingUser) {
      return res.status(400).json({ error: 'Email déjà utilisé' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = { 
      id: Date.now().toString(), 
      email, 
      password_hash: passwordHash, 
      company_name: companyName, 
      account_type: accountType || 'personal',
      role: 'user',
      created_at: Date.now(),
      subscription_end: Date.now() + 30 * 60 * 1000,
      mobile
    };

    const { error } = await supabase.from('users').insert([user]);
    if (error) throw error;
    
    const token = jwt.sign({ userId: user.id }, JWT_SECRET);
    const { password_hash, ...userWithoutPass } = user;
    res.json({ token, user: userWithoutPass });
  } catch (err: any) {
    console.error('Register Error:', err);
    res.status(500).json({ error: err.message || 'Erreur lors de l\'inscription' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!supabaseUrl || supabaseUrl.includes('placeholder')) {
      return res.status(500).json({ error: 'Le serveur Supabase n\'est pas configuré.' });
    }

    const { data: user, error } = await supabase.from('users').select('*').eq('email', email).single();
    if (error || !user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    await supabase.from('users').update({ last_login: Date.now() }).eq('id', user.id);
    
    const token = jwt.sign({ userId: user.id }, JWT_SECRET);
    const { password_hash, ...userWithoutPass } = user;
    res.json({ token, user: userWithoutPass });
  } catch (err: any) {
    console.error('Login Error:', err);
    res.status(500).json({ error: err.message || 'Erreur lors de la connexion' });
  }
});

// MVola Payment Logic
const MVOLA_CONFIG = {
  clientId: process.env.MVOLA_CLIENT_ID,
  clientSecret: process.env.MVOLA_CLIENT_SECRET,
  merchantNumber: process.env.MVOLA_MERCHANT_NUMBER,
  env: process.env.MVOLA_ENVIRONMENT || 'sandbox',
  callbackUrl: process.env.MVOLA_CALLBACK_URL,
};

async function getMVolaToken() {
  const url = MVOLA_CONFIG.env === 'production' 
    ? 'https://api.mvola.mg/token' 
    : 'https://sandbox.mvola.mg/token';
  
  const auth = Buffer.from(`${MVOLA_CONFIG.clientId}:${MVOLA_CONFIG.clientSecret}`).toString('base64');
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials&scope=EXT_INT_MVOLA_SCOPE'
  });
  
  if (!response.ok) throw new Error('Failed to get MVola token');
  const data = await response.json();
  return data.access_token;
}

app.post('/api/payment/mvola/initiate', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Non autorisé' });
  
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const { data: user } = await supabase.from('users').select('*').eq('id', decoded.userId).single();
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });

    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: 'Numéro de téléphone requis' });

    const mvolaToken = await getMVolaToken();
    const url = MVOLA_CONFIG.env === 'production'
      ? 'https://api.mvola.mg/mvola/mm/transactions/type/v1/merchantPay'
      : 'https://sandbox.mvola.mg/mvola/mm/transactions/type/v1/merchantPay';

    const correlationId = Date.now().toString();
    const amount = await getSubscriptionPrice();

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mvolaToken}`,
        'Version': '1.0',
        'X-Correlation-ID': correlationId,
        'UserLanguage': 'FR',
        'UserIp': '127.0.0.1',
        'X-Callback-URL': MVOLA_CONFIG.callbackUrl || '',
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({
        amount: amount,
        currency: 'Ar',
        descriptionText: `Abonnement 1 mois - ${user.email}`,
        requestDate: new Date().toISOString(),
        transactionReference: `SUB-${user.id}-${Date.now()}`,
        receiveParty: [{ key: 'msisdn', value: MVOLA_CONFIG.merchantNumber }],
        requestingOrganisationTransactionReference: `REQ-${user.id}-${Date.now()}`,
        sendParty: [{ key: 'msisdn', value: phoneNumber.replace(/\s/g, '') }],
        metadata: [{ key: 'userId', value: user.id }]
      })
    });

    if (!response.ok) throw new Error('Erreur lors de l\'initiation du paiement MVola');

    const data = await response.json();
    res.json({ 
      status: 'pending', 
      serverCorrelationId: data.serverCorrelationId,
      message: 'Demande envoyée sur votre téléphone. Veuillez confirmer avec votre code secret.'
    });

  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/payment/mvola/callback', express.json(), async (req, res) => {
  const { status, metadata } = req.body;
  
  if (status === 'completed') {
    const userId = metadata?.find((m: any) => m.key === 'userId')?.value;
    const { data: user } = await supabase.from('users').select('*').eq('id', userId).single();
    if (user) {
      const monthMs = 30 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      const start = Math.max(now, user.subscription_end || 0);
      const newEnd = start + monthMs;
      
      const { data: updatedUser } = await supabase.from('users').update({ subscription_end: newEnd }).eq('id', userId).select().single();
      
      if (updatedUser) {
        const { password_hash, ...userWithoutPass } = updatedUser;
        clients.get(userId)?.forEach(ws => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'user_update', user: userWithoutPass }));
          }
        });
      }
    }
  }
  res.status(204).send();
});

app.get('/api/admin/users', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Non autorisé' });
  
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const { data: admin } = await supabase.from('users').select('*').eq('id', decoded.userId).single();
    if (!admin || admin.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    
    const { data: users } = await supabase.from('users').select('*').neq('role', 'admin');
    res.json(users?.map(u => {
      const { password_hash, ...rest } = u;
      return rest;
    }) || []);
  } catch (e) {
    res.status(401).json({ error: 'Token invalide' });
  }
});

app.get('/api/config', async (req, res) => {
  const price = await getSubscriptionPrice();
  res.json({ subscriptionPrice: price });
});

app.get('/api/admin/config', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Non autorisé' });
  
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const { data: admin } = await supabase.from('users').select('*').eq('id', decoded.userId).single();
    if (!admin || admin.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    
    const price = await getSubscriptionPrice();
    res.json({ subscriptionPrice: price });
  } catch (e) {
    res.status(401).json({ error: 'Token invalide' });
  }
});

app.post('/api/admin/update-config', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Non autorisé' });
  
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const { data: admin } = await supabase.from('users').select('*').eq('id', decoded.userId).single();
    if (!admin || admin.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    
    const { price } = req.body;
    if (typeof price === 'number' && price >= 0) {
      await supabase.from('config').upsert({ key: 'subscription_price', value: price.toString() });
      res.json({ success: true, subscriptionPrice: price });
    } else {
      res.status(400).json({ error: 'Prix invalide' });
    }
  } catch (e) {
    res.status(401).json({ error: 'Token invalide' });
  }
});

app.post('/api/admin/update-subscription', async (req, res) => {
  const authHeader = req.headers.authorization;
  const { userId, action } = req.body;
  
  try {
    const token = authHeader!.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const { data: admin } = await supabase.from('users').select('*').eq('id', decoded.userId).single();
    if (!admin || admin.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    
    const { data: user } = await supabase.from('users').select('*').eq('id', userId).single();
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    
    const monthMs = 30 * 24 * 60 * 60 * 1000;
    const minuteMs = 60 * 1000;
    const now = Date.now();
    let newEnd = user.subscription_end;

    if (action === '1min') {
      newEnd = now + minuteMs;
    } else if (action.endsWith('m')) {
      const months = parseInt(action);
      const start = Math.max(now, user.subscription_end || 0);
      newEnd = start + (months * monthMs);
    } else if (action === 'couper') {
      newEnd = now;
    }
    
    await supabase.from('users').update({ subscription_end: newEnd }).eq('id', userId);
    res.json({ success: true, subscriptionEnd: newEnd });
  } catch (e) {
    res.status(401).json({ error: 'Erreur' });
  }
});

app.post('/api/admin/delete-user', async (req, res) => {
  const authHeader = req.headers.authorization;
  const { userId } = req.body;
  try {
    const token = authHeader!.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const { data: admin } = await supabase.from('users').select('*').eq('id', decoded.userId).single();
    if (!admin || admin.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    
    await supabase.from('users').delete().eq('id', userId);
    clients.get(userId)?.forEach(ws => ws.close());
    clients.delete(userId);
    res.json({ success: true });
  } catch (e) {
    res.status(401).json({ error: 'Erreur' });
  }
});

app.post('/api/admin/toggle-blacklist', async (req, res) => {
  const authHeader = req.headers.authorization;
  const { userId } = req.body;
  try {
    const token = authHeader!.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const { data: admin } = await supabase.from('users').select('*').eq('id', decoded.userId).single();
    if (!admin || admin.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    
    const { data: user } = await supabase.from('users').select('*').eq('id', userId).single();
    if (user) {
      const newStatus = !user.is_blacklisted;
      await supabase.from('users').update({ is_blacklisted: newStatus }).eq('id', userId);
      if (newStatus) {
        clients.get(userId)?.forEach(ws => ws.close());
        clients.delete(userId);
      }
      res.json({ success: true, isBlacklisted: newStatus });
    } else {
      res.status(404).json({ error: 'Non trouvé' });
    }
  } catch (e) {
    res.status(401).json({ error: 'Erreur' });
  }
});

// WebSocket logic
const clients = new Map<string, Set<WebSocket>>();

wss.on('connection', (ws, req) => {
  let userId: string | null = null;

  ws.on('message', async (message) => {
    const data = JSON.parse(message.toString());

    if (data.type === 'auth') {
      try {
        const decoded = jwt.verify(data.token, JWT_SECRET) as any;
        userId = decoded.userId;
        const { data: user } = await supabase.from('users').select('*').eq('id', userId).single();
        
        if (userId && user) {
          if (user.is_blacklisted) {
            ws.send(JSON.stringify({ type: 'error', message: 'Votre compte est sur liste noire.' }));
            ws.close();
            return;
          }
          const currentClients = clients.get(userId) || new Set();
          const limit = user.account_type === 'team' ? 5 : 1;
          if (currentClients.size >= limit && user.role !== 'admin') {
            ws.send(JSON.stringify({ type: 'error', message: `Limite de connexion atteinte (${limit} max)` }));
            ws.close();
            return;
          }

          if (!clients.has(userId)) clients.set(userId, new Set());
          clients.get(userId)!.add(ws);
          
          const { data: stateData } = await supabase.from('user_data').select('state').eq('user_id', userId).single();
          if (stateData) {
            ws.send(JSON.stringify({ type: 'init', state: stateData.state }));
          }
        }
      } catch (e) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid token' }));
      }
    }

    if (data.type === 'update' && userId) {
      await supabase.from('user_data').upsert({ user_id: userId, state: data.state });
      clients.get(userId)?.forEach(client => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'update', state: data.state }));
        }
      });
    }
  });

  ws.on('close', () => {
    if (userId && clients.has(userId)) {
      clients.get(userId)!.delete(ws);
      if (clients.get(userId)!.size === 0) clients.delete(userId);
    }
  });
});

async function setupVite() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (req, res) => {
      res.sendFile('dist/index.html', { root: '.' });
    });
  }
}

setupVite().then(() => {
  const PORT = 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
});
