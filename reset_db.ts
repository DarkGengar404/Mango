import Database from 'better-sqlite3';

const db = new Database('chat.db');

console.log('Resetting database...');

db.exec(`
  DROP TABLE IF EXISTS users;
  DROP TABLE IF EXISTS settings;
  
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,
    display_name TEXT,
    public_key TEXT,
    avatar_url TEXT,
    color TEXT,
    glow INTEGER DEFAULT 0,
    bio TEXT,
    password_reset_token TEXT,
    password_reset_expires INTEGER
  );
  
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  
  INSERT INTO settings (key, value) VALUES ('registration_open', '1');
`);

console.log('Database reset complete.');
process.exit(0);
