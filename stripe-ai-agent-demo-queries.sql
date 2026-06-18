
-- confirms pgvector extension was installed
SELECT * FROM pg_extension WHERE extname = 'vector';

-- confirms your app tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

SELECT * FROM drizzle.__drizzle_migrations ORDER BY created_at;

SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at;


-- KB Chunks
SELECT filename, category, COUNT(*) as chunks
FROM kb_chunks
GROUP BY filename, category
ORDER BY filename;


-- Tables
select * from agent_traces;

select * from conversations;

select * from kb_chunks;

select * from kb_documents;

select * from messages;

select * from pending_approvals;

select * from workflows;

