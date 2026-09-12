import { db } from './connection.js'
import { parseJson } from '../utils/helpers.js'

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      member_id TEXT UNIQUE,
      username TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      pin_hash TEXT,
      role TEXT NOT NULL CHECK(role IN ('admin','customer')),
      is_active INTEGER NOT NULL DEFAULT 1,
      must_change_credentials INTEGER NOT NULL DEFAULT 0,
      auth_method TEXT NOT NULL DEFAULT 'pin',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE,
      member_code TEXT UNIQUE,
      name TEXT NOT NULL,
      username TEXT,
      birthdate TEXT,
      phone TEXT,
      email TEXT,
      tier TEXT NOT NULL DEFAULT 'Regular' CHECK(tier IN ('Regular','Gold','VIP')),
      wallet_balance REAL NOT NULL DEFAULT 0 CHECK(wallet_balance >= 0),
      session_seconds_remaining INTEGER NOT NULL DEFAULT 0 CHECK(session_seconds_remaining >= 0),
      status TEXT NOT NULL DEFAULT 'active',
      pc_id TEXT,
      pc_ip TEXT,
      password_hash TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS pcs (
      id TEXT PRIMARY KEY,
      pc_number TEXT,
      label TEXT NOT NULL,
      ip_address TEXT NOT NULL UNIQUE,
      mac_address TEXT,
      spec TEXT,
      -- A registered address is not proof that the station is reachable.
      -- Customer Station socket presence promotes an offline PC to available
      -- (or occupied when a session is active).
      status TEXT NOT NULL DEFAULT 'offline',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rate_plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN ('linear','package')),
      peso_unit REAL,
      minutes_per_unit INTEGER,
      min_amount REAL,
      amount REAL,
      minutes INTEGER,
      base_minutes INTEGER,
      bonus_minutes INTEGER,
      description TEXT,
      customer_tier TEXT NOT NULL DEFAULT 'Regular' CHECK(customer_tier IN ('Regular','Gold','VIP')),
      customer_self_service INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      promo_kind TEXT NOT NULL DEFAULT 'none',
      starts_at TEXT,
      ends_at TEXT,
      time_start TEXT,
      time_end TEXT,
      days_of_week TEXT,
      grace_minutes INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      jwt_id TEXT NOT NULL UNIQUE,
      pc_id TEXT,
      client_ip TEXT,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      ended_at TEXT,
      end_reason TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_auth_user_active
      ON auth_sessions(user_id, revoked_at, expires_at);

    CREATE TABLE IF NOT EXISTS computer_sessions (
      id TEXT PRIMARY KEY,
      member_id TEXT,
      pc_id TEXT,
      rate_plan_id TEXT,
      customer_name TEXT NOT NULL,
      billing_type TEXT NOT NULL CHECK(billing_type IN ('prepaid','postpaid')),
      amount_paid REAL,
      prepaid_seconds INTEGER,
      postpaid_rate_per_minute REAL,
      prepaid_rate_snapshot TEXT,
      settlement_method TEXT,
      started_at TEXT NOT NULL,
      expires_at TEXT,
      last_heartbeat_at TEXT,
      ended_at TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE SET NULL,
      FOREIGN KEY(pc_id) REFERENCES pcs(id) ON DELETE SET NULL,
      FOREIGN KEY(rate_plan_id) REFERENCES rate_plans(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_computer_sessions_active_pc
      ON computer_sessions(pc_id, status);

    CREATE TABLE IF NOT EXISTS session_pauses (
      id TEXT PRIMARY KEY,
      computer_session_id TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT 'admin_lock',
      paused_at TEXT NOT NULL,
      resumed_at TEXT,
      command_id TEXT,
      created_by TEXT,
      FOREIGN KEY(computer_session_id) REFERENCES computer_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_session_pauses_one_active
      ON session_pauses(computer_session_id) WHERE resumed_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_session_pauses_session
      ON session_pauses(computer_session_id, paused_at);

    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      balance_before REAL NOT NULL,
      balance_after REAL NOT NULL,
      reference_type TEXT,
      reference_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE
    );
    -- Existing installations may have an older wallet_transactions table.
    -- The CREATE TABLE above does not alter an existing SQLite table, so the
    -- compatibility migration below adds the newer ledger columns when needed.
    CREATE TABLE IF NOT EXISTS session_time_transactions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      member_id TEXT NOT NULL,
      counterparty_member_id TEXT,
      computer_session_id TEXT,
      seconds INTEGER NOT NULL,
      reference_id TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE,
      FOREIGN KEY(counterparty_member_id) REFERENCES members(id) ON DELETE SET NULL,
      FOREIGN KEY(computer_session_id) REFERENCES computer_sessions(id) ON DELETE SET NULL,
      FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_session_time_transactions_member ON session_time_transactions(member_id, created_at);

    CREATE TABLE IF NOT EXISTS top_up_requests (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL,
      pc_id TEXT,
      amount REAL NOT NULL,
      payment_method TEXT NOT NULL CHECK(payment_method IN ('cash','gcash')),
      ref_no TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      requested_at TEXT NOT NULL,
      processed_at TEXT,
      processed_by TEXT,
      FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS session_extensions (
      id TEXT PRIMARY KEY,
      computer_session_id TEXT NOT NULL,
      member_id TEXT,
      rate_plan_id TEXT,
      amount REAL NOT NULL,
      minutes_added INTEGER NOT NULL,
      payment_method TEXT NOT NULL CHECK(payment_method IN ('cash','wallet','gcash')),
      status TEXT NOT NULL DEFAULT 'pending',
      requested_at TEXT NOT NULL,
      confirmed_at TEXT,
      confirmed_by TEXT,
      FOREIGN KEY(computer_session_id) REFERENCES computer_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE SET NULL,
      FOREIGN KEY(rate_plan_id) REFERENCES rate_plans(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      reference TEXT NOT NULL UNIQUE,
      member_id TEXT,
      amount REAL NOT NULL,
      method TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      external_reference TEXT,
      created_at TEXT NOT NULL,
      confirmed_at TEXT,
      confirmed_by TEXT
    );

    CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      pc_id TEXT,
      details TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'update',
      audience TEXT NOT NULL DEFAULT 'all',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(is_active, created_at);

    CREATE TABLE IF NOT EXISTS customer_feedback (
      id TEXT PRIMARY KEY,
      account_key TEXT NOT NULL,
      member_id TEXT,
      pc_id TEXT,
      customer_name TEXT NOT NULL,
      message TEXT NOT NULL CHECK(length(message) <= 300),
      status TEXT NOT NULL DEFAULT 'unresolved' CHECK(status IN ('unresolved','resolved')),
      resolved_at TEXT,
      resolved_by TEXT,
      archived_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_feedback_inbox ON customer_feedback(archived_at,status,created_at);

    CREATE TABLE IF NOT EXISTS revenue_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      amount_centavos INTEGER NOT NULL,
      occurred_at TEXT NOT NULL,
      created_by TEXT,
      UNIQUE(event_type,source_type,source_id)
    );
    CREATE INDEX IF NOT EXISTS idx_revenue_occurred ON revenue_events(occurred_at);

    CREATE TABLE IF NOT EXISTS financial_reports (
      id TEXT PRIMARY KEY,
      report_number TEXT NOT NULL UNIQUE,
      period_type TEXT NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      created_by TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS idempotency_records (
      scope TEXT NOT NULL,
      request_key TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      response_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(scope, request_key)
    );
    CREATE TABLE IF NOT EXISTS station_control_requests (id TEXT PRIMARY KEY,pc_id TEXT,command TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'authorized',authorized_by TEXT,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,completed_at TEXT,result TEXT);

    CREATE TABLE IF NOT EXISTS pos_products (id TEXT PRIMARY KEY,name TEXT NOT NULL,category TEXT NOT NULL DEFAULT 'Food',price REAL NOT NULL CHECK(price >= 0),stock INTEGER,is_active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS pos_orders (id TEXT PRIMARY KEY,member_id TEXT,pc_id TEXT,total REAL NOT NULL,payment_method TEXT NOT NULL CHECK(payment_method IN ('wallet','cash')),status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL,expires_at TEXT,completed_at TEXT,completed_by TEXT);
    CREATE TABLE IF NOT EXISTS pos_order_items (id TEXT PRIMARY KEY,order_id TEXT NOT NULL,product_id TEXT NOT NULL,quantity INTEGER NOT NULL CHECK(quantity > 0),unit_price REAL NOT NULL,subtotal REAL NOT NULL,FOREIGN KEY(order_id) REFERENCES pos_orders(id) ON DELETE CASCADE,FOREIGN KEY(product_id) REFERENCES pos_products(id) ON DELETE RESTRICT);
    CREATE TABLE IF NOT EXISTS support_messages (id TEXT PRIMARY KEY,member_id TEXT,pc_id TEXT,sender_role TEXT NOT NULL CHECK(sender_role IN ('customer','admin')),message TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',created_at TEXT NOT NULL,read_at TEXT);
    CREATE TABLE IF NOT EXISTS loyalty_accounts (member_id TEXT PRIMARY KEY,points INTEGER NOT NULL DEFAULT 0,xp INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS loyalty_transactions (id TEXT PRIMARY KEY,member_id TEXT NOT NULL,points INTEGER NOT NULL,xp INTEGER NOT NULL DEFAULT 0,reason TEXT NOT NULL,reference_type TEXT,reference_id TEXT,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS remote_commands (id TEXT PRIMARY KEY,pc_id TEXT NOT NULL,command TEXT NOT NULL CHECK(command IN ('lock','unlock','reboot','shutdown','wake','game_update')),payload TEXT,status TEXT NOT NULL DEFAULT 'queued',requested_by TEXT,requested_at TEXT NOT NULL,warning_started_at TEXT,warning_expires_at TEXT,expires_at TEXT,executed_at TEXT,result TEXT);
    CREATE TABLE IF NOT EXISTS expense_records (id TEXT PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('fixed','custom')),category TEXT NOT NULL,description TEXT,amount REAL NOT NULL CHECK(amount >= 0),recorded_at TEXT NOT NULL,recurrence TEXT NOT NULL DEFAULT 'one_time',source_key TEXT,period_key TEXT,annual_amount REAL,monthly_amount REAL,created_by TEXT,created_at TEXT NOT NULL,FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL);
    CREATE INDEX IF NOT EXISTS idx_expense_records_recorded_at ON expense_records(recorded_at);
    CREATE TABLE IF NOT EXISTS fixed_expense_definitions (
      id TEXT PRIMARY KEY,
      source_key TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      monthly_amount REAL NOT NULL CHECK(monthly_amount >= 0),
      due_day INTEGER NOT NULL CHECK(due_day BETWEEN 1 AND 28),
      effective_from TEXT NOT NULL,
      effective_until TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS promo_redemptions (
      id TEXT PRIMARY KEY,
      promo_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      redeemed_at TEXT NOT NULL,
      UNIQUE(promo_id,user_id),
      FOREIGN KEY(promo_id) REFERENCES rate_plans(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES members(id) ON DELETE CASCADE,
      FOREIGN KEY(session_id) REFERENCES computer_sessions(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS promo_seat_redemptions (
      id TEXT PRIMARY KEY,
      pc_id TEXT NOT NULL,
      promo_id TEXT NOT NULL,
      redeemed_name TEXT,
      session_id TEXT NOT NULL,
      redeemed_at TEXT NOT NULL,
      cooldown_cleared_by TEXT,
      cooldown_cleared_at TEXT,
      FOREIGN KEY(pc_id) REFERENCES pcs(id) ON DELETE CASCADE,
      FOREIGN KEY(promo_id) REFERENCES rate_plans(id) ON DELETE CASCADE,
      FOREIGN KEY(session_id) REFERENCES computer_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY(cooldown_cleared_by) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS promo_name_ledger (
      id TEXT PRIMARY KEY,
      promo_id TEXT NOT NULL,
      name_normalized TEXT NOT NULL,
      redeemed_at TEXT NOT NULL,
      FOREIGN KEY(promo_id) REFERENCES rate_plans(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_promo_seat_active ON promo_seat_redemptions(promo_id,pc_id,cooldown_cleared_at,redeemed_at);
    CREATE INDEX IF NOT EXISTS idx_promo_name_recent ON promo_name_ledger(promo_id,name_normalized,redeemed_at);
    CREATE TABLE IF NOT EXISTS transfer_requests (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      from_pc_id TEXT NOT NULL,
      to_pc_id TEXT NOT NULL,
      requested_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
      resolved_by TEXT,
      resolved_at TEXT,
      FOREIGN KEY(session_id) REFERENCES computer_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY(from_pc_id) REFERENCES pcs(id) ON DELETE CASCADE,
      FOREIGN KEY(to_pc_id) REFERENCES pcs(id) ON DELETE CASCADE,
      FOREIGN KEY(resolved_by) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_transfer_requests_status ON transfer_requests(status,requested_at);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS brand_assets (
      id TEXT PRIMARY KEY,
      mime_type TEXT NOT NULL,
      data BLOB NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT
    );

    -- Hybrid SaaS foundation. These tables are local-only edge state and do
    -- not change the authority of the existing operational SQLite tables.
    CREATE TABLE IF NOT EXISTS cloud_identity (
      id INTEGER PRIMARY KEY CHECK(id=1),
      organization_id TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      edge_id TEXT NOT NULL,
      edge_token TEXT NOT NULL,
      cloud_url TEXT NOT NULL,
      realtime_topic_key TEXT,
      paired_at TEXT NOT NULL,
      last_seen_at TEXT,
      config_version INTEGER NOT NULL DEFAULT 0,
      metadata TEXT
    );
    CREATE TABLE IF NOT EXISTS sync_outbox (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      payload_json TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT,
      synced_at TEXT,
      last_error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sync_outbox_pending
      ON sync_outbox(synced_at,next_attempt_at,occurred_at);
    CREATE TABLE IF NOT EXISTS cloud_admin_actions (
      cloud_command_id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      result TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS sync_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cloud_branch_config (
      id INTEGER PRIMARY KEY CHECK(id=1),
      version INTEGER NOT NULL DEFAULT 0,
      config_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL
    );
  `)
  const cloudIdentityCols = db.prepare('PRAGMA table_info(cloud_identity)').all().map(c => c.name)
  if (!cloudIdentityCols.includes('realtime_topic_key')) db.exec('ALTER TABLE cloud_identity ADD COLUMN realtime_topic_key TEXT')
  const walletTransactionCols = db.prepare('PRAGMA table_info(wallet_transactions)').all().map(c => c.name)
  if (!walletTransactionCols.includes('reference_type')) db.exec('ALTER TABLE wallet_transactions ADD COLUMN reference_type TEXT')
  if (!walletTransactionCols.includes('reference_id')) db.exec('ALTER TABLE wallet_transactions ADD COLUMN reference_id TEXT')
  const sessionCols = db.prepare('PRAGMA table_info(computer_sessions)').all().map(c => c.name)
  const pcCols = db.prepare('PRAGMA table_info(pcs)').all().map(c => c.name)
  if (!pcCols.includes('station_token_hash')) db.exec('ALTER TABLE pcs ADD COLUMN station_token_hash TEXT')
  if (!pcCols.includes('paired_at')) db.exec('ALTER TABLE pcs ADD COLUMN paired_at TEXT')
  if (!sessionCols.includes('last_heartbeat_at')) db.exec("ALTER TABLE computer_sessions ADD COLUMN last_heartbeat_at TEXT")
  if (!sessionCols.includes('postpaid_rate_per_minute')) db.exec('ALTER TABLE computer_sessions ADD COLUMN postpaid_rate_per_minute REAL')
  if (!sessionCols.includes('settlement_method')) db.exec('ALTER TABLE computer_sessions ADD COLUMN settlement_method TEXT')
  if (!sessionCols.includes('prepaid_rate_snapshot')) db.exec('ALTER TABLE computer_sessions ADD COLUMN prepaid_rate_snapshot TEXT')
  const authCols = db.prepare('PRAGMA table_info(auth_sessions)').all().map(c => c.name)
  if (!authCols.includes('ended_at')) db.exec('ALTER TABLE auth_sessions ADD COLUMN ended_at TEXT')
  if (!authCols.includes('end_reason')) db.exec('ALTER TABLE auth_sessions ADD COLUMN end_reason TEXT')
  db.exec(`
    INSERT OR IGNORE INTO revenue_events(id,event_type,source_type,source_id,amount_centavos,occurred_at,created_by)
    SELECT 'legacy-session-' || cs.id,'session_total','computer_session',cs.id,ROUND(cs.amount_paid*100),COALESCE(cs.ended_at,cs.started_at),NULL
    FROM computer_sessions cs
    WHERE cs.amount_paid IS NOT NULL AND cs.amount_paid > 0
      AND NOT EXISTS (
        SELECT 1 FROM revenue_events recorded
        WHERE recorded.source_type='computer_session' AND recorded.source_id=cs.id
          AND recorded.event_type IN ('session_start','postpaid_settlement','session_total')
      );
    INSERT OR IGNORE INTO revenue_events(id,event_type,source_type,source_id,amount_centavos,occurred_at,created_by)
    SELECT 'legacy-refund-' || id,'session_refund','computer_session',COALESCE(reference_id,id),-ROUND(amount*100),created_at,NULL
    FROM wallet_transactions WHERE type='refund' AND amount > 0;
  `)
  const memberCols = db.prepare('PRAGMA table_info(members)').all().map(c => c.name)
  if (!memberCols.includes('session_seconds_remaining')) db.exec("ALTER TABLE members ADD COLUMN session_seconds_remaining INTEGER NOT NULL DEFAULT 0")
  // Normalize legacy tier typos before enforcing tier semantics in application code.
  db.exec("UPDATE members SET tier='Regular' WHERE tier IS NULL OR tier NOT IN ('Regular','Gold','VIP')")
  const rateCols = db.prepare('PRAGMA table_info(rate_plans)').all().map(c => c.name)
  if (rateCols.includes('must_change_credentials')) db.exec('ALTER TABLE rate_plans DROP COLUMN must_change_credentials')
  if (rateCols.includes('auth_method')) db.exec('ALTER TABLE rate_plans DROP COLUMN auth_method')
  if (!rateCols.includes('customer_tier')) db.exec("ALTER TABLE rate_plans ADD COLUMN customer_tier TEXT NOT NULL DEFAULT 'Regular'")
  if (!rateCols.includes('promo_kind')) db.exec("ALTER TABLE rate_plans ADD COLUMN promo_kind TEXT NOT NULL DEFAULT 'none'")
  if (!rateCols.includes('starts_at')) db.exec('ALTER TABLE rate_plans ADD COLUMN starts_at TEXT')
  if (!rateCols.includes('ends_at')) db.exec('ALTER TABLE rate_plans ADD COLUMN ends_at TEXT')
  if (!rateCols.includes('time_start')) db.exec('ALTER TABLE rate_plans ADD COLUMN time_start TEXT')
  if (!rateCols.includes('time_end')) db.exec('ALTER TABLE rate_plans ADD COLUMN time_end TEXT')
  if (!rateCols.includes('days_of_week')) db.exec('ALTER TABLE rate_plans ADD COLUMN days_of_week TEXT')
  if (!rateCols.includes('grace_minutes')) db.exec('ALTER TABLE rate_plans ADD COLUMN grace_minutes INTEGER NOT NULL DEFAULT 0')
  const posOrderCols = db.prepare('PRAGMA table_info(pos_orders)').all().map(c => c.name)
  if (!posOrderCols.includes('expires_at')) db.exec('ALTER TABLE pos_orders ADD COLUMN expires_at TEXT')
  db.exec("UPDATE pos_orders SET expires_at=strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+15 minutes') WHERE expires_at IS NULL AND status='pending'")

  const remoteCols = db.prepare('PRAGMA table_info(remote_commands)').all().map(c => c.name)
  if (!remoteCols.includes('warning_started_at')) db.exec('ALTER TABLE remote_commands ADD COLUMN warning_started_at TEXT')
  if (!remoteCols.includes('warning_expires_at')) db.exec('ALTER TABLE remote_commands ADD COLUMN warning_expires_at TEXT')
  if (!remoteCols.includes('expires_at')) db.exec('ALTER TABLE remote_commands ADD COLUMN expires_at TEXT')
  if (!remoteCols.includes('cloud_command_id')) db.exec('ALTER TABLE remote_commands ADD COLUMN cloud_command_id TEXT')
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_remote_commands_cloud_id ON remote_commands(cloud_command_id) WHERE cloud_command_id IS NOT NULL')
  db.exec("UPDATE remote_commands SET expires_at=strftime('%Y-%m-%dT%H:%M:%fZ', requested_at, '+15 seconds') WHERE expires_at IS NULL AND status IN ('queued','running')")
  const announcementCols = db.prepare('PRAGMA table_info(announcements)').all().map(c => c.name)
  if (!announcementCols.includes('starts_at')) db.exec('ALTER TABLE announcements ADD COLUMN starts_at TEXT')
  if (!announcementCols.includes('ends_at')) db.exec('ALTER TABLE announcements ADD COLUMN ends_at TEXT')
  const expenseCols = db.prepare('PRAGMA table_info(expense_records)').all().map(c => c.name)
  if (!expenseCols.includes('recurrence')) db.exec("ALTER TABLE expense_records ADD COLUMN recurrence TEXT NOT NULL DEFAULT 'one_time'")
  if (!expenseCols.includes('source_key')) db.exec('ALTER TABLE expense_records ADD COLUMN source_key TEXT')
  if (!expenseCols.includes('period_key')) db.exec('ALTER TABLE expense_records ADD COLUMN period_key TEXT')
  if (!expenseCols.includes('annual_amount')) db.exec('ALTER TABLE expense_records ADD COLUMN annual_amount REAL')
  if (!expenseCols.includes('monthly_amount')) db.exec('ALTER TABLE expense_records ADD COLUMN monthly_amount REAL')
  if (!expenseCols.includes('tax_rate_percent')) db.exec('ALTER TABLE expense_records ADD COLUMN tax_rate_percent REAL')
  if (!expenseCols.includes('taxable_base')) db.exec('ALTER TABLE expense_records ADD COLUMN taxable_base REAL')
  if (!expenseCols.includes('formula_snapshot')) db.exec('ALTER TABLE expense_records ADD COLUMN formula_snapshot TEXT')
  if (!expenseCols.includes('tax_year')) db.exec('ALTER TABLE expense_records ADD COLUMN tax_year INTEGER')
  if (!expenseCols.includes('reversed_expense_id')) db.exec('ALTER TABLE expense_records ADD COLUMN reversed_expense_id TEXT')
  if (!expenseCols.includes('voided_at')) db.exec('ALTER TABLE expense_records ADD COLUMN voided_at TEXT')
  if (!expenseCols.includes('signed_amount')) db.exec('ALTER TABLE expense_records ADD COLUMN signed_amount REAL')
  const fixedDefinitionCols = db.prepare('PRAGMA table_info(fixed_expense_definitions)').all().map(c => c.name)
  if (!fixedDefinitionCols.includes('effective_until')) db.exec('ALTER TABLE fixed_expense_definitions ADD COLUMN effective_until TEXT')
  const revenueCols = db.prepare('PRAGMA table_info(revenue_events)').all().map(c => c.name)
  if (!revenueCols.includes('category')) db.exec('ALTER TABLE revenue_events ADD COLUMN category TEXT')
  if (!revenueCols.includes('payment_method')) db.exec('ALTER TABLE revenue_events ADD COLUMN payment_method TEXT')
  if (!revenueCols.includes('member_id')) db.exec('ALTER TABLE revenue_events ADD COLUMN member_id TEXT')
  if (!revenueCols.includes('pc_id')) db.exec('ALTER TABLE revenue_events ADD COLUMN pc_id TEXT')
  if (!revenueCols.includes('metadata')) db.exec('ALTER TABLE revenue_events ADD COLUMN metadata TEXT')
  if (!revenueCols.includes('reversed_event_id')) db.exec('ALTER TABLE revenue_events ADD COLUMN reversed_event_id TEXT')
  const extensionCols = db.prepare('PRAGMA table_info(session_extensions)').all().map(c => c.name)
  if (!extensionCols.includes('rate_plan_id')) db.exec('ALTER TABLE session_extensions ADD COLUMN rate_plan_id TEXT')
  // Existing installations may contain more than one pending request for a session.
  // Keep the newest deterministically before installing the database invariant.
  db.exec(`UPDATE transfer_requests SET status='rejected',resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    WHERE rowid IN (
      SELECT rowid FROM (
        SELECT rowid,ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY requested_at DESC,rowid DESC) rn
        FROM transfer_requests WHERE status='pending'
      ) WHERE rn>1
    )`)
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_transfer_requests_one_pending ON transfer_requests(session_id) WHERE status='pending'")
  // Legacy staff accounts are outside the current admin/customer runtime contract.
  db.exec("UPDATE users SET is_active=0 WHERE role NOT IN ('admin','customer')")

  const topUpCols = db.prepare('PRAGMA table_info(top_up_requests)').all().map(c => c.name)
  if (!topUpCols.includes('archived_at')) db.exec('ALTER TABLE top_up_requests ADD COLUMN archived_at TEXT')
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_expense_fixed_period ON expense_records(source_key, period_key) WHERE source_key IS NOT NULL AND period_key IS NOT NULL")

  // Repair impossible legacy duplicates deterministically before installing hard
  // invariants. Keep the newest active session and end older duplicates.
  const migrationNow = new Date().toISOString()
  db.prepare(`UPDATE computer_sessions SET status='ended',ended_at=COALESCE(ended_at,?)
    WHERE status='active' AND pc_id IS NOT NULL AND id IN (
      SELECT id FROM (
        SELECT id,ROW_NUMBER() OVER (PARTITION BY pc_id ORDER BY started_at DESC,id DESC) AS rn
        FROM computer_sessions WHERE status='active' AND pc_id IS NOT NULL
      ) WHERE rn>1
    )`).run(migrationNow)
  db.prepare(`UPDATE computer_sessions SET status='ended',ended_at=COALESCE(ended_at,?)
    WHERE status='active' AND member_id IS NOT NULL AND id IN (
      SELECT id FROM (
        SELECT id,ROW_NUMBER() OVER (PARTITION BY member_id ORDER BY started_at DESC,id DESC) AS rn
        FROM computer_sessions WHERE status='active' AND member_id IS NOT NULL
      ) WHERE rn>1
    )`).run(migrationNow)
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_computer_sessions_one_active_pc
      ON computer_sessions(pc_id) WHERE status='active' AND pc_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_computer_sessions_one_active_member
      ON computer_sessions(member_id) WHERE status='active' AND member_id IS NOT NULL;
  `)

  // Sanitized cloud replication. Triggers capture every local mutation path into the durable outbox.
  db.exec(`
    DROP TRIGGER IF EXISTS cloud_members_insert; DROP TRIGGER IF EXISTS cloud_members_update; DROP TRIGGER IF EXISTS cloud_members_delete;
    CREATE TRIGGER cloud_members_insert AFTER INSERT ON members WHEN EXISTS(SELECT 1 FROM cloud_identity WHERE id=1) BEGIN
      INSERT INTO sync_outbox(id,event_type,entity_type,entity_id,payload_json,occurred_at) VALUES(lower(hex(randomblob(16))),'member.upsert','member',NEW.id,json_object('id',NEW.id,'member_code',NEW.member_code,'name',NEW.name,'username',NEW.username,'birthdate',NEW.birthdate,'phone',NEW.phone,'email',NEW.email,'tier',NEW.tier,'wallet_balance',NEW.wallet_balance,'session_seconds_remaining',NEW.session_seconds_remaining,'status',NEW.status,'pc_id',NEW.pc_id,'pc_ip',NEW.pc_ip,'created_at',NEW.created_at,'updated_at',NEW.updated_at),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;
    CREATE TRIGGER cloud_members_update AFTER UPDATE ON members WHEN EXISTS(SELECT 1 FROM cloud_identity WHERE id=1) BEGIN
      INSERT INTO sync_outbox(id,event_type,entity_type,entity_id,payload_json,occurred_at) VALUES(lower(hex(randomblob(16))),'member.upsert','member',NEW.id,json_object('id',NEW.id,'member_code',NEW.member_code,'name',NEW.name,'username',NEW.username,'birthdate',NEW.birthdate,'phone',NEW.phone,'email',NEW.email,'tier',NEW.tier,'wallet_balance',NEW.wallet_balance,'session_seconds_remaining',NEW.session_seconds_remaining,'status',NEW.status,'pc_id',NEW.pc_id,'pc_ip',NEW.pc_ip,'created_at',NEW.created_at,'updated_at',NEW.updated_at),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;
    CREATE TRIGGER cloud_members_delete AFTER DELETE ON members WHEN EXISTS(SELECT 1 FROM cloud_identity WHERE id=1) BEGIN
      INSERT INTO sync_outbox(id,event_type,entity_type,entity_id,payload_json,occurred_at) VALUES(lower(hex(randomblob(16))),'member.delete','member',OLD.id,json_object('id',OLD.id),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;

    DROP TRIGGER IF EXISTS cloud_pcs_insert; DROP TRIGGER IF EXISTS cloud_pcs_update; DROP TRIGGER IF EXISTS cloud_pcs_delete;
    CREATE TRIGGER cloud_pcs_insert AFTER INSERT ON pcs WHEN EXISTS(SELECT 1 FROM cloud_identity WHERE id=1) BEGIN
      INSERT INTO sync_outbox(id,event_type,entity_type,entity_id,payload_json,occurred_at) VALUES(lower(hex(randomblob(16))),'station.upsert','station',NEW.id,json_object('id',NEW.id,'pc_number',NEW.pc_number,'label',NEW.label,'ip_address',NEW.ip_address,'mac_address',NEW.mac_address,'spec',NEW.spec,'status',NEW.status,'created_at',NEW.created_at,'updated_at',NEW.updated_at),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;
    CREATE TRIGGER cloud_pcs_update AFTER UPDATE ON pcs WHEN EXISTS(SELECT 1 FROM cloud_identity WHERE id=1) BEGIN
      INSERT INTO sync_outbox(id,event_type,entity_type,entity_id,payload_json,occurred_at) VALUES(lower(hex(randomblob(16))),'station.upsert','station',NEW.id,json_object('id',NEW.id,'pc_number',NEW.pc_number,'label',NEW.label,'ip_address',NEW.ip_address,'mac_address',NEW.mac_address,'spec',NEW.spec,'status',NEW.status,'created_at',NEW.created_at,'updated_at',NEW.updated_at),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;
    CREATE TRIGGER cloud_pcs_delete AFTER DELETE ON pcs WHEN EXISTS(SELECT 1 FROM cloud_identity WHERE id=1) BEGIN
      INSERT INTO sync_outbox(id,event_type,entity_type,entity_id,payload_json,occurred_at) VALUES(lower(hex(randomblob(16))),'station.delete','station',OLD.id,json_object('id',OLD.id),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;

    DROP TRIGGER IF EXISTS cloud_rates_insert; DROP TRIGGER IF EXISTS cloud_rates_update; DROP TRIGGER IF EXISTS cloud_rates_delete;
    CREATE TRIGGER cloud_rates_insert AFTER INSERT ON rate_plans WHEN EXISTS(SELECT 1 FROM cloud_identity WHERE id=1) BEGIN INSERT INTO sync_outbox(id,event_type,entity_type,entity_id,payload_json,occurred_at) VALUES(lower(hex(randomblob(16))),'rate_plan.upsert','rate_plan',NEW.id,json_object('id',NEW.id,'name',NEW.name,'mode',NEW.mode,'peso_unit',NEW.peso_unit,'minutes_per_unit',NEW.minutes_per_unit,'min_amount',NEW.min_amount,'amount',NEW.amount,'minutes',NEW.minutes,'base_minutes',NEW.base_minutes,'bonus_minutes',NEW.bonus_minutes,'description',NEW.description,'customer_tier',NEW.customer_tier,'customer_self_service',NEW.customer_self_service,'is_active',NEW.is_active,'promo_kind',NEW.promo_kind,'starts_at',NEW.starts_at,'ends_at',NEW.ends_at,'time_start',NEW.time_start,'time_end',NEW.time_end,'days_of_week',NEW.days_of_week,'grace_minutes',NEW.grace_minutes,'created_at',NEW.created_at,'updated_at',NEW.updated_at),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;
    CREATE TRIGGER cloud_rates_update AFTER UPDATE ON rate_plans WHEN EXISTS(SELECT 1 FROM cloud_identity WHERE id=1) BEGIN INSERT INTO sync_outbox(id,event_type,entity_type,entity_id,payload_json,occurred_at) VALUES(lower(hex(randomblob(16))),'rate_plan.upsert','rate_plan',NEW.id,json_object('id',NEW.id,'name',NEW.name,'mode',NEW.mode,'peso_unit',NEW.peso_unit,'minutes_per_unit',NEW.minutes_per_unit,'min_amount',NEW.min_amount,'amount',NEW.amount,'minutes',NEW.minutes,'base_minutes',NEW.base_minutes,'bonus_minutes',NEW.bonus_minutes,'description',NEW.description,'customer_tier',NEW.customer_tier,'customer_self_service',NEW.customer_self_service,'is_active',NEW.is_active,'promo_kind',NEW.promo_kind,'starts_at',NEW.starts_at,'ends_at',NEW.ends_at,'time_start',NEW.time_start,'time_end',NEW.time_end,'days_of_week',NEW.days_of_week,'grace_minutes',NEW.grace_minutes,'created_at',NEW.created_at,'updated_at',NEW.updated_at),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;
    CREATE TRIGGER cloud_rates_delete AFTER DELETE ON rate_plans WHEN EXISTS(SELECT 1 FROM cloud_identity WHERE id=1) BEGIN INSERT INTO sync_outbox(id,event_type,entity_type,entity_id,payload_json,occurred_at) VALUES(lower(hex(randomblob(16))),'rate_plan.delete','rate_plan',OLD.id,json_object('id',OLD.id),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;

    DROP TRIGGER IF EXISTS cloud_sessions_insert; DROP TRIGGER IF EXISTS cloud_sessions_update;
    CREATE TRIGGER cloud_sessions_insert AFTER INSERT ON computer_sessions WHEN EXISTS(SELECT 1 FROM cloud_identity WHERE id=1) BEGIN INSERT INTO sync_outbox(id,event_type,entity_type,entity_id,payload_json,occurred_at) VALUES(lower(hex(randomblob(16))),'session.upsert','session',NEW.id,json_object('id',NEW.id,'member_id',NEW.member_id,'pc_id',NEW.pc_id,'rate_plan_id',NEW.rate_plan_id,'customer_name',NEW.customer_name,'billing_type',NEW.billing_type,'amount_paid',NEW.amount_paid,'prepaid_seconds',NEW.prepaid_seconds,'postpaid_rate_per_minute',NEW.postpaid_rate_per_minute,'started_at',NEW.started_at,'expires_at',NEW.expires_at,'ended_at',NEW.ended_at,'status',NEW.status),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;
    CREATE TRIGGER cloud_sessions_update AFTER UPDATE ON computer_sessions WHEN EXISTS(SELECT 1 FROM cloud_identity WHERE id=1) BEGIN INSERT INTO sync_outbox(id,event_type,entity_type,entity_id,payload_json,occurred_at) VALUES(lower(hex(randomblob(16))),'session.upsert','session',NEW.id,json_object('id',NEW.id,'member_id',NEW.member_id,'pc_id',NEW.pc_id,'rate_plan_id',NEW.rate_plan_id,'customer_name',NEW.customer_name,'billing_type',NEW.billing_type,'amount_paid',NEW.amount_paid,'prepaid_seconds',NEW.prepaid_seconds,'postpaid_rate_per_minute',NEW.postpaid_rate_per_minute,'started_at',NEW.started_at,'expires_at',NEW.expires_at,'ended_at',NEW.ended_at,'status',NEW.status),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;

    DROP TRIGGER IF EXISTS cloud_wallet_insert; CREATE TRIGGER cloud_wallet_insert AFTER INSERT ON wallet_transactions WHEN EXISTS(SELECT 1 FROM cloud_identity WHERE id=1) BEGIN INSERT INTO sync_outbox(id,event_type,entity_type,entity_id,payload_json,occurred_at) VALUES(lower(hex(randomblob(16))),'wallet_ledger.insert','wallet_transaction',NEW.id,json_object('id',NEW.id,'member_id',NEW.member_id,'type',NEW.type,'amount',NEW.amount,'balance_before',NEW.balance_before,'balance_after',NEW.balance_after,'reference_type',NEW.reference_type,'reference_id',NEW.reference_id,'created_at',NEW.created_at),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;
    DROP TRIGGER IF EXISTS cloud_session_time_insert; CREATE TRIGGER cloud_session_time_insert AFTER INSERT ON session_time_transactions WHEN EXISTS(SELECT 1 FROM cloud_identity WHERE id=1) BEGIN INSERT INTO sync_outbox(id,event_type,entity_type,entity_id,payload_json,occurred_at) VALUES(lower(hex(randomblob(16))),'session_time_ledger.insert','session_time_transaction',NEW.id,json_object('id',NEW.id,'type',NEW.type,'member_id',NEW.member_id,'counterparty_member_id',NEW.counterparty_member_id,'computer_session_id',NEW.computer_session_id,'seconds',NEW.seconds,'reference_id',NEW.reference_id,'created_at',NEW.created_at),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;

    DROP TRIGGER IF EXISTS cloud_topups_insert; DROP TRIGGER IF EXISTS cloud_topups_update;
    CREATE TRIGGER cloud_topups_insert AFTER INSERT ON top_up_requests WHEN EXISTS(SELECT 1 FROM cloud_identity WHERE id=1) BEGIN INSERT INTO sync_outbox(id,event_type,entity_type,entity_id,payload_json,occurred_at) VALUES(lower(hex(randomblob(16))),'top_up.upsert','top_up',NEW.id,json_object('id',NEW.id,'member_id',NEW.member_id,'pc_id',NEW.pc_id,'amount',NEW.amount,'payment_method',NEW.payment_method,'ref_no',NEW.ref_no,'status',NEW.status,'requested_at',NEW.requested_at,'processed_at',NEW.processed_at),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;
    CREATE TRIGGER cloud_topups_update AFTER UPDATE ON top_up_requests WHEN EXISTS(SELECT 1 FROM cloud_identity WHERE id=1) BEGIN INSERT INTO sync_outbox(id,event_type,entity_type,entity_id,payload_json,occurred_at) VALUES(lower(hex(randomblob(16))),'top_up.upsert','top_up',NEW.id,json_object('id',NEW.id,'member_id',NEW.member_id,'pc_id',NEW.pc_id,'amount',NEW.amount,'payment_method',NEW.payment_method,'ref_no',NEW.ref_no,'status',NEW.status,'requested_at',NEW.requested_at,'processed_at',NEW.processed_at),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;

    DROP TRIGGER IF EXISTS cloud_extensions_insert; DROP TRIGGER IF EXISTS cloud_extensions_update;
    CREATE TRIGGER cloud_extensions_insert AFTER INSERT ON session_extensions WHEN EXISTS(SELECT 1 FROM cloud_identity WHERE id=1) BEGIN INSERT INTO sync_outbox(id,event_type,entity_type,entity_id,payload_json,occurred_at) VALUES(lower(hex(randomblob(16))),'session_extension.upsert','session_extension',NEW.id,json_object('id',NEW.id,'computer_session_id',NEW.computer_session_id,'member_id',NEW.member_id,'rate_plan_id',NEW.rate_plan_id,'amount',NEW.amount,'minutes_added',NEW.minutes_added,'payment_method',NEW.payment_method,'status',NEW.status,'requested_at',NEW.requested_at,'confirmed_at',NEW.confirmed_at),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;
    CREATE TRIGGER cloud_extensions_update AFTER UPDATE ON session_extensions WHEN EXISTS(SELECT 1 FROM cloud_identity WHERE id=1) BEGIN INSERT INTO sync_outbox(id,event_type,entity_type,entity_id,payload_json,occurred_at) VALUES(lower(hex(randomblob(16))),'session_extension.upsert','session_extension',NEW.id,json_object('id',NEW.id,'computer_session_id',NEW.computer_session_id,'member_id',NEW.member_id,'rate_plan_id',NEW.rate_plan_id,'amount',NEW.amount,'minutes_added',NEW.minutes_added,'payment_method',NEW.payment_method,'status',NEW.status,'requested_at',NEW.requested_at,'confirmed_at',NEW.confirmed_at),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;

    DROP TRIGGER IF EXISTS cloud_revenue_insert; CREATE TRIGGER cloud_revenue_insert AFTER INSERT ON revenue_events WHEN EXISTS(SELECT 1 FROM cloud_identity WHERE id=1) BEGIN INSERT INTO sync_outbox(id,event_type,entity_type,entity_id,payload_json,occurred_at) VALUES(lower(hex(randomblob(16))),'revenue.insert','revenue_event',NEW.id,json_object('id',NEW.id,'event_type',NEW.event_type,'source_type',NEW.source_type,'source_id',NEW.source_id,'amount_centavos',NEW.amount_centavos,'occurred_at',NEW.occurred_at,'category',NEW.category,'payment_method',NEW.payment_method,'member_id',NEW.member_id,'pc_id',NEW.pc_id,'metadata',NEW.metadata,'reversed_event_id',NEW.reversed_event_id),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;

    DROP TRIGGER IF EXISTS cloud_announcements_insert; DROP TRIGGER IF EXISTS cloud_announcements_update; DROP TRIGGER IF EXISTS cloud_announcements_delete;
    CREATE TRIGGER cloud_announcements_insert AFTER INSERT ON announcements WHEN EXISTS(SELECT 1 FROM cloud_identity WHERE id=1) BEGIN INSERT INTO sync_outbox(id,event_type,entity_type,entity_id,payload_json,occurred_at) VALUES(lower(hex(randomblob(16))),'announcement.upsert','announcement',NEW.id,json_object('id',NEW.id,'title',NEW.title,'message',NEW.message,'kind',NEW.kind,'audience',NEW.audience,'is_active',NEW.is_active,'starts_at',NEW.starts_at,'ends_at',NEW.ends_at,'created_at',NEW.created_at,'updated_at',NEW.updated_at),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;
    CREATE TRIGGER cloud_announcements_update AFTER UPDATE ON announcements WHEN EXISTS(SELECT 1 FROM cloud_identity WHERE id=1) BEGIN INSERT INTO sync_outbox(id,event_type,entity_type,entity_id,payload_json,occurred_at) VALUES(lower(hex(randomblob(16))),'announcement.upsert','announcement',NEW.id,json_object('id',NEW.id,'title',NEW.title,'message',NEW.message,'kind',NEW.kind,'audience',NEW.audience,'is_active',NEW.is_active,'starts_at',NEW.starts_at,'ends_at',NEW.ends_at,'created_at',NEW.created_at,'updated_at',NEW.updated_at),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;
    CREATE TRIGGER cloud_announcements_delete AFTER DELETE ON announcements WHEN EXISTS(SELECT 1 FROM cloud_identity WHERE id=1) BEGIN INSERT INTO sync_outbox(id,event_type,entity_type,entity_id,payload_json,occurred_at) VALUES(lower(hex(randomblob(16))),'announcement.delete','announcement',OLD.id,json_object('id',OLD.id),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;

    DROP TRIGGER IF EXISTS cloud_feedback_insert; DROP TRIGGER IF EXISTS cloud_feedback_update;
    CREATE TRIGGER cloud_feedback_insert AFTER INSERT ON customer_feedback WHEN EXISTS(SELECT 1 FROM cloud_identity WHERE id=1) BEGIN INSERT INTO sync_outbox(id,event_type,entity_type,entity_id,payload_json,occurred_at) VALUES(lower(hex(randomblob(16))),'feedback.upsert','feedback',NEW.id,json_object('id',NEW.id,'member_id',NEW.member_id,'pc_id',NEW.pc_id,'customer_name',NEW.customer_name,'message',NEW.message,'status',NEW.status,'resolved_at',NEW.resolved_at,'archived_at',NEW.archived_at,'created_at',NEW.created_at),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;
    CREATE TRIGGER cloud_feedback_update AFTER UPDATE ON customer_feedback WHEN EXISTS(SELECT 1 FROM cloud_identity WHERE id=1) BEGIN INSERT INTO sync_outbox(id,event_type,entity_type,entity_id,payload_json,occurred_at) VALUES(lower(hex(randomblob(16))),'feedback.upsert','feedback',NEW.id,json_object('id',NEW.id,'member_id',NEW.member_id,'pc_id',NEW.pc_id,'customer_name',NEW.customer_name,'message',NEW.message,'status',NEW.status,'resolved_at',NEW.resolved_at,'archived_at',NEW.archived_at,'created_at',NEW.created_at),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;
  `)

  const cols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name)
  if (!cols.includes('must_change_credentials')) db.exec("ALTER TABLE users ADD COLUMN must_change_credentials INTEGER NOT NULL DEFAULT 0")
  if (!cols.includes('auth_method')) db.exec("ALTER TABLE users ADD COLUMN auth_method TEXT NOT NULL DEFAULT 'pin'")
  const postpaidMinutes=db.prepare("SELECT value FROM settings WHERE key='postpaidMinutesPerPeso'").get()
  if(!postpaidMinutes){const legacy=Number(parseJson(db.prepare("SELECT value FROM settings WHERE key='postpaidPesoPerMinute'").get()?.value,'1'));const minutesPerPeso=legacy>0&&Number.isFinite(legacy)?1/legacy:1;db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('postpaidMinutesPerPeso',?)").run(JSON.stringify(minutesPerPeso))}
}
