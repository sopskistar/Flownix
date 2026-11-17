CREATE TABLE token_project_classifications (
 token_id text PRIMARY KEY REFERENCES alpha_tokens(id),
 classification text NOT NULL CHECK(classification IN ('verified_non_meme','verified_meme_focused','mixed_ambiguous','unclassified')),
 evidence_url text NOT NULL,
 evidence_note text NOT NULL,
 reviewed_by text NOT NULL,
 reviewed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX token_project_classification_idx ON token_project_classifications(classification,reviewed_at DESC);
