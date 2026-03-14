import express from 'express';
import { createServer as createViteServer } from 'vite';
import { Server } from 'socket.io';
import http from 'http';
import path from 'path';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-in-prod';
const PORT = 3000;

// Initialize SQLite
const db = new Database('chat.db');

// Ensure schema is up to date
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0
  );
`);

// Migration: Add columns if they don't exist
const columns = [
  { name: 'display_name', type: 'TEXT' },
  { name: 'public_key', type: 'TEXT' },
  { name: 'avatar_url', type: 'TEXT' },
  { name: 'color', type: 'TEXT' },
  { name: 'glow', type: 'INTEGER DEFAULT 0' }
];

const tableInfo = db.prepare("PRAGMA table_info(users)").all() as any[];
const existingColumns = tableInfo.map(c => c.name);

for (const col of columns) {
  if (!existingColumns.includes(col.name)) {
    console.log(`Adding column ${col.name} to users table`);
    db.exec(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type}`);
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  INSERT OR IGNORE INTO settings (key, value) VALUES ('registration_open', '1');
`);

const onlineUsers = new Set<number>();
const userSockets = new Map<number, Set<string>>();
const voiceStates = new Map<number, { muted: boolean, deafened: boolean }>();
const voiceUsers = new Map<number, number>(); // userId -> joinedAt timestamp

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: '*' },
    maxHttpBufferSize: 1e8 // 100 MB for video chunks if needed
  });

  app.use(express.json());

  // API Routes
  app.get('/api/settings', (req, res) => {
    const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
    const row = stmt.get('registration_open') as any;
    res.json({ registrationOpen: row?.value === '1' });
  });

  app.post('/api/auth/enter', async (req, res) => {
    const { username, password, publicKey, isSignup } = req.body;
    
    try {
      const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
      const user = stmt.get(username) as any;

      if (!isSignup) {
        // Login flow
        if (!user) {
          return res.status(401).json({ error: 'Invalid credentials' });
        }
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
          return res.status(401).json({ error: 'Invalid credentials' });
        }

        if (publicKey) {
          const update = db.prepare('UPDATE users SET public_key = ? WHERE id = ?');
          update.run(publicKey, user.id);
          user.public_key = publicKey;
        }

        const token = jwt.sign({ id: user.id, username: user.username, isAdmin: !!user.is_admin }, JWT_SECRET);
        return res.json({ token, user: { id: user.id, username: user.username, displayName: user.display_name || user.username, isAdmin: !!user.is_admin, publicKey: user.public_key } });
      } else {
        // Signup flow
        if (user) {
          return res.status(400).json({ error: 'Username already exists' });
        }

        const countStmt = db.prepare('SELECT COUNT(*) as count FROM users');
        const { count } = countStmt.get() as { count: number };

        // Check if registration is open (first user always allowed to create admin)
        if (count > 0) {
          const regStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
          const regRow = regStmt.get('registration_open') as any;
          if (regRow?.value !== '1') {
            return res.status(403).json({ error: 'Registration is currently closed.' });
          }
        }

        const hash = await bcrypt.hash(password, 10);
        const isAdmin = count === 0 ? 1 : 0;
        const insert = db.prepare('INSERT INTO users (username, display_name, password_hash, is_admin, public_key) VALUES (?, ?, ?, ?, ?)');
        const info = insert.run(username, username, hash, isAdmin, publicKey);

        const token = jwt.sign({ id: info.lastInsertRowid, username, isAdmin: !!isAdmin }, JWT_SECRET);
        return res.json({ token, user: { id: info.lastInsertRowid, username, displayName: username, isAdmin: !!isAdmin, publicKey } });
      }
    } catch (error: any) {
      console.error('Auth error:', error);
      res.status(500).json({ error: `Authentication failed: ${error.message}` });
    }
  });

  app.post('/api/admin/settings', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
    
    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET) as any;
      if (!decoded.isAdmin) return res.status(403).json({ error: 'Forbidden' });

      const { registrationOpen } = req.body;
      const stmt = db.prepare('UPDATE settings SET value = ? WHERE key = ?');
      stmt.run(registrationOpen ? '1' : '0', 'registration_open');
      
      res.json({ success: true });
    } catch (error) {
      res.status(401).json({ error: 'Invalid token' });
    }
  });

  app.get('/api/users', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

    try {
      jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
      const stmt = db.prepare('SELECT id, username, display_name, is_admin, public_key, avatar_url, color, glow FROM users');
      const users = stmt.all();
      res.json(users);
    } catch (error) {
      console.error('Fetch users error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.put('/api/users/me', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      const { display_name, avatar_url, color, glow } = req.body;
      
      const userStmt = db.prepare('SELECT display_name, username FROM users WHERE id = ?');
      const oldUser = userStmt.get(decoded.id) as any;
      if (!oldUser) return res.status(404).json({ error: 'User not found' });
      
      const oldDisplayName = oldUser.display_name || oldUser.username;

      const update = db.prepare('UPDATE users SET display_name = ?, avatar_url = ?, color = ?, glow = ? WHERE id = ?');
      update.run(display_name, avatar_url, color, glow ? 1 : 0, decoded.id);
      
      if (display_name && display_name !== oldDisplayName) {
        io.emit('message', {
          from: 0, // System
          to: 'main',
          system: true,
          text: `${oldDisplayName} changed their name to ${display_name}`,
          timestamp: Date.now()
        });
      }

      io.emit('users_updated');
      res.json({ success: true });
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/admin/users', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET) as any;
      if (!decoded.isAdmin) return res.status(403).json({ error: 'Forbidden' });

      const { username, password, publicKey } = req.body;
      
      const countStmt = db.prepare('SELECT COUNT(*) as count FROM users');
      const { count } = countStmt.get() as { count: number };
      if (count >= 10) {
        return res.status(400).json({ error: 'Maximum 10 users allowed' });
      }

      const hash = await bcrypt.hash(password, 10);
      const insert = db.prepare('INSERT INTO users (username, password_hash, is_admin, public_key) VALUES (?, ?, 0, ?)');
      const info = insert.run(username, hash, publicKey);

      res.json({ user: { id: info.lastInsertRowid, username, isAdmin: false } });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create user' });
    }
  });

  // Socket.IO
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error'));
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      socket.data.user = decoded;
      next();
    } catch (error) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    console.log('User connected:', socket.data.user.username);
    
    const userId = socket.data.user.id;
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
      onlineUsers.add(userId);
    }
    userSockets.get(userId)!.add(socket.id);

    io.emit('online_users', Array.from(onlineUsers));
    socket.emit('voice_users', getVoiceUsers());
    socket.emit('voice_states', Array.from(voiceStates.entries()));
    
    // Join a room for personal messages
    socket.join(`user_${socket.data.user.id}`);
    
    // Broadcast online status
    io.emit('user_status', { userId: socket.data.user.id, status: 'online' });

    socket.on('message', (data) => {
      // data: { to: 'main' | userId, encryptedPayload: string, iv: string }
      if (data.to === 'main') {
        io.emit('message', {
          from: socket.data.user.id,
          to: 'main',
          encryptedPayload: data.encryptedPayload,
          iv: data.iv,
          timestamp: Date.now()
        });
      } else {
        const payload = {
          from: socket.data.user.id,
          to: data.to,
          encryptedPayload: data.encryptedPayload,
          iv: data.iv,
          timestamp: Date.now()
        };
        io.to(`user_${data.to}`).emit('message', payload);
        io.to(`user_${socket.data.user.id}`).emit('message', payload);
      }
    });

    // WebCodecs Screenshare Relay
    socket.on('video_chunk', (data) => {
      // data: { chunk: ArrayBuffer, type: 'key' | 'delta', timestamp: number }
      socket.broadcast.emit('video_chunk', {
        from: socket.data.user.id,
        chunk: data.chunk,
        type: data.type,
        timestamp: data.timestamp
      });
    });

    socket.on('video_config', (data) => {
      socket.broadcast.emit('video_config', {
        from: socket.data.user.id,
        config: data.config
      });
    });

    socket.on('join_voice', () => {
      socket.join('voice_general');
      if (!voiceUsers.has(socket.data.user.id)) {
        voiceUsers.set(socket.data.user.id, Date.now());
      }
      io.emit('voice_users', getVoiceUsers());
    });

    socket.on('leave_voice', () => {
      socket.leave('voice_general');
      // Only remove from voiceUsers if no other sockets for this user are in the voice room
      const room = io.sockets.adapter.rooms.get('voice_general');
      const userHasOtherSocketsInVoice = Array.from(room || []).some(sid => {
        const s = io.sockets.sockets.get(sid);
        return s && s.data.user.id === socket.data.user.id && s.id !== socket.id;
      });

      if (!userHasOtherSocketsInVoice) {
        voiceUsers.delete(socket.data.user.id);
      }
      io.emit('voice_users', getVoiceUsers());
    });

    socket.on('voice_chunk', (chunk) => {
      socket.to('voice_general').emit('voice_chunk', {
        from: socket.data.user.id,
        chunk
      });
    });

    socket.on('voice_state', (state) => {
      voiceStates.set(socket.data.user.id, state);
      io.emit('voice_state_update', { userId: socket.data.user.id, state });
    });

    socket.on('ping', (cb) => {
      if (typeof cb === 'function') cb();
    });

    socket.on('disconnect', () => {
      const userId = socket.data.user.id;
      const sockets = userSockets.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          userSockets.delete(userId);
          onlineUsers.delete(userId);
          voiceStates.delete(userId);
          voiceUsers.delete(userId);
          io.emit('user_status', { userId, status: 'offline' });
        } else {
          // Check if user should still be in voice
          const room = io.sockets.adapter.rooms.get('voice_general');
          const stillInVoice = Array.from(room || []).some(sid => {
            const s = io.sockets.sockets.get(sid);
            return s && s.data.user.id === userId;
          });
          if (!stillInVoice) {
            voiceUsers.delete(userId);
          }
        }
      }
      
      io.emit('online_users', Array.from(onlineUsers));
      io.emit('voice_users', getVoiceUsers());
    });
  });

  function getVoiceUsers() {
    return Array.from(voiceUsers.entries()).map(([id, joinedAt]) => ({ id, joinedAt }));
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Global error handler to prevent HTML error pages
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Server Error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
