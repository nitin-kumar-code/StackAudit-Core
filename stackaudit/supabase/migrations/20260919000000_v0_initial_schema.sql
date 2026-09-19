-- V0 Schema for AI Cost Intelligence

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Organizations
-- Represents a simple workspace/project boundary for V0.
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Workloads
-- Represents a business process.
-- Deletion behavior: ON DELETE CASCADE. Deleting an org deletes its workloads.
CREATE TABLE workloads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workloads_org_id ON workloads(organization_id);

-- 3. Attribution Rules
-- Maps canonical usage events to workloads (e.g., by api_key).
-- Deletion behavior: ON DELETE CASCADE. Deleting a workload removes its rules.
CREATE TABLE attribution_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workload_id UUID NOT NULL REFERENCES workloads(id) ON DELETE CASCADE,
    rule_type TEXT NOT NULL,
    rule_value TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workload_id, rule_type, rule_value)
);

CREATE INDEX idx_attribution_rules_type_value ON attribution_rules(rule_type, rule_value);

-- 4. Pricing Catalog
-- Contains versioned pricing records. Uses NUMERIC for decimal-safe prices.
CREATE TABLE pricing_catalog (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    input_price NUMERIC NOT NULL,
    output_price NUMERIC NOT NULL,
    cached_input_price NUMERIC,
    effective_from TIMESTAMPTZ NOT NULL,
    effective_until TIMESTAMPTZ,
    source TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pricing_catalog_lookup ON pricing_catalog(provider, model, effective_from DESC);

-- 5. Usage Events
-- Canonical representation of AI usage.
-- Deletion behavior:
--   organization_id -> CASCADE (wipe workspace)
--   workload_id -> SET NULL (preserve financial history if workload is deleted, it just becomes unattributed)
CREATE TABLE usage_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    input_tokens BIGINT NOT NULL,
    output_tokens BIGINT NOT NULL,
    cached_input_tokens BIGINT,
    -- provider_reference is our own deterministic synthetic key (e.g., hash of bucket_start + model + api_key_id + workspace_id)
    -- because providers like OpenAI/Anthropic return time-bucketed aggregates, not a single opaque request ID.
    provider_reference TEXT NOT NULL,
    workload_id UUID REFERENCES workloads(id) ON DELETE SET NULL,
    calculated_cost NUMERIC,
    -- Audit trail for billing disputes and recalculations
    raw_response_hash TEXT NOT NULL,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Multi-tenant safe deduplication
    UNIQUE (organization_id, provider, provider_reference)
);

CREATE INDEX idx_usage_events_org_time ON usage_events(organization_id, timestamp DESC);
CREATE INDEX idx_usage_events_workload_time ON usage_events(workload_id, timestamp DESC);
CREATE INDEX idx_usage_events_provider_model_time ON usage_events(provider, model, timestamp DESC);

-- 6. Outcome Events
-- Business work completed by a workload.
-- Deletion behavior: ON DELETE CASCADE. Outcomes are tied to the workload lifecycle.
CREATE TABLE outcome_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workload_id UUID NOT NULL REFERENCES workloads(id) ON DELETE CASCADE,
    outcome_type TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    count INTEGER NOT NULL CHECK (count > 0),
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_outcome_events_workload_time ON outcome_events(workload_id, timestamp DESC);
CREATE INDEX idx_outcome_events_workload_type_time ON outcome_events(workload_id, outcome_type, timestamp DESC);

-- 7. Audit Findings
-- Findings emitted by the Audit Engine.
CREATE TABLE audit_findings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workload_id UUID REFERENCES workloads(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    finding TEXT NOT NULL,
    confidence TEXT NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
    evidence JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_findings_workload_time ON audit_findings(workload_id, created_at DESC);

-- RLS NOTE: 
-- Row Level Security (RLS) is intentionally NOT enabled in this V0 schema.
-- This deferral is a known limitation that MUST be resolved prior to the 13 May 2027 DPDP 
-- compliance deadline (India), which mandates strict access control and logging. 
-- See SECURITY.md for tracking.
