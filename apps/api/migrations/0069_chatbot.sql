-- PR-03-20/21/22/23/34 + PR-05-25/36, FR-19.1/19.2. Expand.
-- migrate:up
CREATE TABLE chat_sessions (
 id bigserial PRIMARY KEY, user_id bigint NOT NULL REFERENCES users(id), judul text NOT NULL DEFAULT 'Percakapan baru',
 dimulai_pada timestamptz NOT NULL, terakhir_aktif timestamptz NOT NULL,
 reported_at timestamptz, reported_message_id bigint, report_note text,
 CHECK (char_length(judul)<=200), CHECK ((reported_at IS NULL)=(reported_message_id IS NULL))
);
CREATE INDEX chat_sessions_owner_idx ON chat_sessions(user_id,terakhir_aktif DESC,id DESC);
CREATE INDEX chat_sessions_retention_idx ON chat_sessions(terakhir_aktif,id);
CREATE TABLE chat_messages (
 id bigserial PRIMARY KEY, session_id bigint NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
 client_message_id uuid, payload_hash text, peran text NOT NULL CHECK(peran IN ('USER','ASSISTANT')),
 isi text NOT NULL, status text NOT NULL CHECK(status IN ('PROCESSING','COMPLETED','FAILED','INCOMPLETE')),
 tools_dipanggil jsonb NOT NULL DEFAULT '[]', steps jsonb NOT NULL DEFAULT '[]', references_data jsonb NOT NULL DEFAULT '[]',
 permission_digest text NOT NULL, token_input integer NOT NULL DEFAULT 0 CHECK(token_input>=0),
 token_output integer NOT NULL DEFAULT 0 CHECK(token_output>=0), token_cached integer NOT NULL DEFAULT 0 CHECK(token_cached>=0),
 token_thought integer NOT NULL DEFAULT 0 CHECK(token_thought>=0), elapsed_ms integer,
 umpan_balik text CHECK(umpan_balik IN ('UP','DOWN')), error_code text, waktu timestamptz NOT NULL,
 UNIQUE(session_id,client_message_id,peran)
);
CREATE INDEX chat_messages_session_idx ON chat_messages(session_id,id);
CREATE TABLE chat_restrictions(user_id bigint PRIMARY KEY REFERENCES users(id),blocked boolean NOT NULL,updated_at timestamptz NOT NULL,updated_by bigint NOT NULL REFERENCES users(id));
CREATE UNIQUE INDEX chat_messages_one_processing ON chat_messages(session_id) WHERE peran='ASSISTANT' AND status='PROCESSING';
ALTER TABLE chat_sessions ADD CONSTRAINT chat_report_message_fk FOREIGN KEY (reported_message_id) REFERENCES chat_messages(id) DEFERRABLE INITIALLY DEFERRED;
-- Metrik tidak menyimpan isi pesan, ID sesi/akun atau argumen tool (DP-AI-05).
CREATE TABLE chat_usage_daily (
 tanggal date PRIMARY KEY, messages bigint NOT NULL DEFAULT 0, failures bigint NOT NULL DEFAULT 0,
 positive bigint NOT NULL DEFAULT 0, negative bigint NOT NULL DEFAULT 0,
 input_tokens bigint NOT NULL DEFAULT 0, output_tokens bigint NOT NULL DEFAULT 0,
 cached_tokens bigint NOT NULL DEFAULT 0, thought_tokens bigint NOT NULL DEFAULT 0,
 total_latency_ms bigint NOT NULL DEFAULT 0, tool_counts jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE chat_evaluations (
 id bigserial PRIMARY KEY, pada timestamptz NOT NULL, model text NOT NULL, prompt_hash text NOT NULL,
 mode text NOT NULL CHECK(mode IN ('LIVE','CONTRACT')), total integer NOT NULL, correct integer NOT NULL,
 critical_failures integer NOT NULL, accuracy numeric NOT NULL, details jsonb NOT NULL
);
INSERT INTO system_settings(key,kelompok,tipe,value,nilai_bawaan,nilai_min,nilai_maks,deskripsi) VALUES
 ('chat.aktif','CHATBOT_AI','BOOLEAN','true','true',NULL,NULL,'Pengalih chatbot tanpa memengaruhi modul lain; CHAT_ENABLED tetap batas instalasi.'),
 ('chat.model','CHATBOT_AI','TEKS','"gemini-3.6-flash"','"gemini-3.6-flash"',NULL,NULL,'Model stabil/GA yang telah dievaluasi; tanpa alias latest/preview.'),
 ('chat.batas_harian','CHATBOT_AI','BILANGAN_BULAT','50','50',1,1000,'Pesan per akun per hari; reset pukul 00.00 WIB.'),
 ('chat.ambang_token_harian','CHATBOT_AI','BILANGAN_BULAT','0','0',0,2147483647,'Ambang alarm konsumsi token; nol berarti menunggu kalibrasi TBD-AI-C.')
ON CONFLICT(key) DO NOTHING;
-- migrate:down
-- Jangan membuang percakapan saat rollback aplikasi; gunakan forward fix setelah ada data.
DO $$ BEGIN IF EXISTS(SELECT 1 FROM chat_sessions) OR EXISTS(SELECT 1 FROM chat_usage_daily) OR EXISTS(SELECT 1 FROM chat_evaluations) OR EXISTS(SELECT 1 FROM chat_restrictions) THEN RAISE EXCEPTION 'Rollback chatbot ditolak: masih ada data operasional/evaluasi'; END IF; END $$;
DELETE FROM system_settings WHERE key IN ('chat.aktif','chat.model','chat.batas_harian','chat.ambang_token_harian');
DROP TABLE chat_evaluations,chat_usage_daily;
ALTER TABLE chat_sessions DROP CONSTRAINT chat_report_message_fk;
DROP TABLE chat_messages,chat_sessions,chat_restrictions;
