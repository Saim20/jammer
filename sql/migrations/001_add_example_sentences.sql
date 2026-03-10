-- Migration: add optional example_sentences column to words
-- Run this in the Supabase SQL editor.

ALTER TABLE public.words
  ADD COLUMN IF NOT EXISTS example_sentences text[] NOT NULL DEFAULT '{}';
