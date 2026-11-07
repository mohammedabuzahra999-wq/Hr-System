-- pgvector must exist before a vector column can be declared.
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
ALTER TABLE "job_descriptions" ADD COLUMN "embedding" vector(1536);--> statement-breakpoint
CREATE INDEX "job_descriptions_embedding_idx" ON "job_descriptions" USING hnsw ("embedding" vector_cosine_ops);