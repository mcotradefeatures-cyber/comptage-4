import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { HistoryEntry, TableData } from './types';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'comptage-mco-secret-key';

// In-memory store
const users: any[] = [
  // Default admin account
  {
    id: 'admin-1',
    email: 'admin@mco.mg',
    passwordHash: bcrypt.hashSync('admin123', 10),
    role: 'admin',
    accountType: 'team',
    createdAt: Date.now(),
    companyName: 'ADMIN MCO'
  },
  // Default test account
  {
    id: 'test-1',
    email: 'test@mco.mg',
    passwordHash: bcrypt.hashSync('test123', 10),
    role: 'user',
    accountType: 'personal',
    createdAt: Date.now(),
    companyName: 'TEST COMPTE',
    mobile: '034 11 222 33'
  }
];

const userStates: Record<string, any> = {};
let subscriptionPrice = 200; // Default price in Ar

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
  const { email, password, companyName, accountType, mobile } = req.body;
  if (users.find(u => u.email === email)) {
    return res.status(400).json({ error: 'Email déjà utilisé' });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = { 
    id: Date.now().toString(), 
    email, 
    passwordHash, 
    companyName, 
    accountType: accountType || 'personal',
    role: 'user',
    createdAt: Date.now(),
    subscriptionEnd: Date.now() + 30 * 60 * 1000,
    mobile
  };
  users.push(user);
  
  const token = jwt.sign({ userId: user.id }, JWT_SECRET);
  res.json({ token, user });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => u.email === email);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Identifiants invalides' });
  }
  user.lastLogin = Date.now();
  const token = jwt.sign({ userId: user.id }, JWT_SECRET);
  res.json({ token, user });
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
    const user = users.find(u => u.id === decoded.userId);
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });

    const { phoneNumber } = req.body; // The user's MVola number
    if (!phoneNumber) return res.status(400).json({ error: 'Numéro de téléphone requis' });

    // 1. Get Token
    const mvolaToken = await getMVolaToken();

    // 2. Initiate Payment (STK Push)
    const url = MVOLA_CONFIG.env === 'production'
      ? 'https://api.mvola.mg/mvola/mm/transactions/type/v1/merchantPay'
      : 'https://sandbox.mvola.mg/mvola/mm/transactions/type/v1/merchantPay';

    const correlationId = Date.now().toString();
    const amount = subscriptionPrice;

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
        receiveParty: [
          {
            key: 'msisdn',
            value: MVOLA_CONFIG.merchantNumber
          }
        ],
        requestingOrganisationTransactionReference: `REQ-${user.id}-${Date.now()}`,
        sendParty: [
          {
            key: 'msisdn',
            value: phoneNumber.replace(/\s/g, '')
          }
        ],
        metadata: [
          {
            key: 'userId',
            value: user.id
          }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('MVola Error:', errorData);
      throw new Error('Erreur lors de l\'initiation du paiement MVola');
    }

    const data = await response.json();
    
    // In a real scenario, we would wait for a callback.
    // For this demo/implementation, we'll assume the user will confirm on their phone.
    // We can provide a "Check Status" button or poll.
    
    res.json({ 
      status: 'pending', 
      serverCorrelationId: data.serverCorrelationId,
      message: 'Demande envoyée sur votre téléphone. Veuillez confirmer avec votre code secret.'
    });

  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Mock callback for manual testing or real integration
app.post('/api/payment/mvola/callback', express.json(), (req, res) => {
  const { status, serverCorrelationId, transactionReference, metadata } = req.body;
  
  if (status === 'completed') {
    const userId = metadata?.find((m: any) => m.key === 'userId')?.value;
    const user = users.find(u => u.id === userId);
    if (user) {
      const monthMs = 30 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      const start = Math.max(now, user.subscriptionEnd || 0);
      user.subscriptionEnd = start + monthMs;
      console.log(`Abonnement activé pour ${user.email} via MVola`);
      
      // Notify connected clients
      clients.get(userId)?.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'user_update', user }));
        }
      });
    }
  }
  
  res.status(204).send();
});

app.get('/api/admin/users', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Non autorisé' });
  
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const admin = users.find(u => u.id === decoded.userId);
    if (!admin || admin.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    
    // Filter out admin and return users
    res.json(users
      .filter(u => u.role !== 'admin')
      .map(u => {
        const { passwordHash, ...rest } = u;
        return rest;
      })
    );
  } catch (e) {
    res.status(401).json({ error: 'Token invalide' });
  }
});

// Public config
app.get('/api/config', (req, res) => {
  res.json({ subscriptionPrice });
});

app.get('/api/admin/config', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Non autorisé' });
  
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const admin = users.find(u => u.id === decoded.userId);
    if (!admin || admin.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    
    res.json({ subscriptionPrice });
  } catch (e) {
    res.status(401).json({ error: 'Token invalide' });
  }
});

app.post('/api/admin/update-config', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Non autorisé' });
  
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const admin = users.find(u => u.id === decoded.userId);
    if (!admin || admin.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    
    const { price } = req.body;
    if (typeof price === 'number' && price >= 0) {
      subscriptionPrice = price;
      res.json({ success: true, subscriptionPrice });
    } else {
      res.status(400).json({ error: 'Prix invalide' });
    }
  } catch (e) {
    res.status(401).json({ error: 'Token invalide' });
  }
});

app.post('/api/admin/update-subscription', (req, res) => {
  const authHeader = req.headers.authorization;
  const { userId, action } = req.body;
  
  try {
    const token = authHeader!.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const admin = users.find(u => u.id === decoded.userId);
    if (!admin || admin.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    
    const user = users.find(u => u.id === userId);
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    
    const monthMs = 30 * 24 * 60 * 60 * 1000;
    const minuteMs = 60 * 1000;
    const now = Date.now();

    if (action === '1min') {
      user.subscriptionEnd = now + minuteMs;
    } else if (action.endsWith('m')) {
      const months = parseInt(action);
      const start = Math.max(now, user.subscriptionEnd || 0);
      user.subscriptionEnd = start + (months * monthMs);
    } else if (action === 'couper') {
      user.subscriptionEnd = now;
    }
    
    res.json({ success: true, subscriptionEnd: user.subscriptionEnd });
  } catch (e) {
    res.status(401).json({ error: 'Erreur' });
  }
});

app.post('/api/admin/delete-user', (req, res) => {
  const authHeader = req.headers.authorization;
  const { userId } = req.body;
  try {
    const token = authHeader!.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const admin = users.find(u => u.id === decoded.userId);
    if (!admin || admin.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    
    const index = users.findIndex(u => u.id === userId);
    if (index !== -1) {
      users.splice(index, 1);
      delete userStates[userId];
      // Close connections
      clients.get(userId)?.forEach(ws => ws.close());
      clients.delete(userId);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(401).json({ error: 'Erreur' });
  }
});

app.post('/api/admin/toggle-blacklist', (req, res) => {
  const authHeader = req.headers.authorization;
  const { userId } = req.body;
  try {
    const token = authHeader!.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const admin = users.find(u => u.id === decoded.userId);
    if (!admin || admin.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    
    const user = users.find(u => u.id === userId);
    if (user) {
      user.isBlacklisted = !user.isBlacklisted;
      if (user.isBlacklisted) {
        clients.get(userId)?.forEach(ws => ws.close());
        clients.delete(userId);
      }
    }
    res.json({ success: true, isBlacklisted: user?.isBlacklisted });
  } catch (e) {
    res.status(401).json({ error: 'Erreur' });
  }
});

// WebSocket logic
const clients = new Map<string, Set<WebSocket>>();

wss.on('connection', (ws, req) => {
  let userId: string | null = null;

  ws.on('message', (message) => {
    const data = JSON.parse(message.toString());

    if (data.type === 'auth') {
      try {
        const decoded = jwt.verify(data.token, JWT_SECRET) as any;
        userId = decoded.userId;
        const user = users.find(u => u.id === userId);
        
        if (userId && user) {
          if (user.isBlacklisted) {
            ws.send(JSON.stringify({ type: 'error', message: 'Votre compte est sur liste noire.' }));
            ws.close();
            return;
          }
          const currentClients = clients.get(userId) || new Set();
          
          // Check limits
          const limit = user.accountType === 'team' ? 5 : 1;
          if (currentClients.size >= limit && user.role !== 'admin') {
            ws.send(JSON.stringify({ type: 'error', message: `Limite de connexion atteinte (${limit} max)` }));
            ws.close();
            return;
          }

          if (!clients.has(userId)) clients.set(userId, new Set());
          clients.get(userId)!.add(ws);
          
          // Send initial state if exists
          if (userStates[userId]) {
            ws.send(JSON.stringify({ type: 'init', state: userStates[userId] }));
          }
        }
      } catch (e) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid token' }));
      }
    }

    if (data.type === 'update' && userId) {
      userStates[userId] = data.state;
      // Broadcast to other clients of the same user
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

// Vite middleware for development
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
