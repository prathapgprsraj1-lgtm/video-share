import pkg from '../server/node_modules/pg/lib/index.js';
const { Client } = pkg;

const connectionString = 'postgres://postgres.wfxgwpwbqciuuuzidfdg:636140%40Prathap@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres';

async function migrate() {
  console.log('🚀 Connecting to Supabase PostgreSQL...');
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('✅ Connected to Supabase DB. Running migrations...\n');

  const sql = `
    CREATE TABLE IF NOT EXISTS guest_sessions (
      id TEXT PRIMARY KEY,
      session_token TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      avatar_url TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      last_seen_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      owner_guest_id TEXT NOT NULL,
      visibility TEXT DEFAULT 'public',
      password_hash TEXT,
      waiting_room_enabled INTEGER DEFAULT 0,
      is_locked INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      max_participants INTEGER DEFAULT 50,
      created_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ,
      ended_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS room_members (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      guest_id TEXT NOT NULL REFERENCES guest_sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      joined_at TIMESTAMPTZ NOT NULL,
      left_at TIMESTAMPTZ,
      membership_status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS room_invitations (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      token_hash TEXT,
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      max_uses INTEGER DEFAULT 0,
      use_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      sender_guest_id TEXT NOT NULL,
      message_type TEXT NOT NULL,
      content TEXT NOT NULL,
      reply_to_message_id TEXT,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ,
      deleted_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS message_attachments (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      storage_key TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      content_type TEXT NOT NULL,
      size_bytes BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS message_reactions (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      guest_id TEXT NOT NULL,
      emoji TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      CONSTRAINT uq_message_guest_emoji UNIQUE (message_id, guest_id, emoji)
    );

    CREATE TABLE IF NOT EXISTS watch_sessions (
      id TEXT PRIMARY KEY,
      room_id TEXT UNIQUE NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      host_guest_id TEXT NOT NULL,
      media_source TEXT NOT NULL,
      playback_status TEXT NOT NULL,
      playback_position DOUBLE PRECISION NOT NULL,
      server_updated_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      ended_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS idx_members_room ON room_members(room_id, membership_status);
    CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_invitations_token ON room_invitations(token);
  `;

  await client.query(sql);
  console.log('✅ All ConnectRoom tables and indexes successfully created in Supabase PostgreSQL!');

  // Setup Storage Bucket for Media Attachments
  await client.query(`
    INSERT INTO storage.buckets (id, name, public) 
    VALUES ('connectroom-media', 'connectroom-media', true)
    ON CONFLICT (id) DO NOTHING;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Public Access ConnectRoom Media'
      ) THEN
        CREATE POLICY "Public Access ConnectRoom Media" 
        ON storage.objects FOR SELECT 
        USING (bucket_id = 'connectroom-media');
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Public Upload ConnectRoom Media'
      ) THEN
        CREATE POLICY "Public Upload ConnectRoom Media" 
        ON storage.objects FOR INSERT 
        WITH CHECK (bucket_id = 'connectroom-media');
      END IF;
    END
    $$;
  `);
  console.log('✅ Storage bucket "connectroom-media" initialized with public access policies!');

  const tablesRes = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);

  console.log('\n📊 Tables present in Supabase public schema:');
  tablesRes.rows.forEach(r => console.log(' - ' + r.table_name));

  await client.end();
}

migrate().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
