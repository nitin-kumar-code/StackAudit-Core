import { SupabaseClient } from '@supabase/supabase-js';
import { Workload, AttributionRule } from '../types';

export class WorkloadNotFoundError extends Error {
  constructor(id: string) {
    super(`Workload ${id} not found`);
    this.name = 'WorkloadNotFoundError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export interface CreateWorkloadDTO {
  organizationId: string;
  name: string;
  description?: string;
}

export interface UpdateWorkloadDTO {
  name?: string;
  description?: string;
}

export interface CreateAttributionRuleDTO {
  provider: string;
  matchType: string;
  matchValue: string;
}

export class WorkloadService {
  constructor(private supabase: SupabaseClient) {}

  async createWorkload(dto: CreateWorkloadDTO): Promise<Workload> {
    if (!dto.name || dto.name.trim() === '') {
      throw new ValidationError('Workload name is required');
    }

    const { data, error } = await this.supabase
      .from('workloads')
      .insert({
        organization_id: dto.organizationId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create workload: ${error.message}`);
    
    return {
      id: data.id,
      organizationId: data.organization_id,
      name: data.name,
      description: data.description,
      createdAt: new Date(data.created_at)
    };
  }

  async listWorkloads(organizationId: string): Promise<Workload[]> {
    const { data, error } = await this.supabase
      .from('workloads')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to list workloads: ${error.message}`);

    return data.map(d => ({
      id: d.id,
      organizationId: d.organization_id,
      name: d.name,
      description: d.description,
      createdAt: new Date(d.created_at)
    }));
  }

  async getWorkload(organizationId: string, id: string): Promise<Workload> {
    const { data, error } = await this.supabase
      .from('workloads')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single();

    if (error || !data) throw new WorkloadNotFoundError(id);

    return {
      id: data.id,
      organizationId: data.organization_id,
      name: data.name,
      description: data.description,
      createdAt: new Date(data.created_at)
    };
  }

  async updateWorkload(organizationId: string, id: string, dto: UpdateWorkloadDTO): Promise<Workload> {
    if (dto.name !== undefined && dto.name.trim() === '') {
      throw new ValidationError('Workload name cannot be empty');
    }

    const updateData: { name?: string; description?: string | null } = {};
    if (dto.name !== undefined) updateData.name = dto.name.trim();
    if (dto.description !== undefined) updateData.description = dto.description?.trim() || null;

    const { data, error } = await this.supabase
      .from('workloads')
      .update(updateData)
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select()
      .single();

    if (error || !data) throw new WorkloadNotFoundError(id);

    return {
      id: data.id,
      organizationId: data.organization_id,
      name: data.name,
      description: data.description,
      createdAt: new Date(data.created_at)
    };
  }

  async deleteWorkload(organizationId: string, id: string): Promise<void> {
    // Delete triggers CASCADE for rules.
    // usage_events.workload_id is removed in V0 structure (derived via view), so no manual UNSET is required.
    const { error } = await this.supabase
      .from('workloads')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (error) throw new Error(`Failed to delete workload: ${error.message}`);
  }

  async createAttributionRule(organizationId: string, workloadId: string, dto: CreateAttributionRuleDTO): Promise<AttributionRule> {
    if (!dto.provider || !dto.matchType || !dto.matchValue) {
      throw new ValidationError('provider, matchType, and matchValue are required');
    }
    
    // Ensure workload exists in this org
    await this.getWorkload(organizationId, workloadId);

    const { data, error } = await this.supabase
      .from('attribution_rules')
      .insert({
        organization_id: organizationId,
        workload_id: workloadId,
        provider: dto.provider.trim(),
        match_type: dto.matchType.trim(),
        match_value: dto.matchValue.trim()
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') { // Postgres unique violation (organization_id, provider, match_type, match_value)
        throw new ValidationError('This rule (provider + match value) is already attributed to a workload in this organization.');
      }
      throw new Error(`Failed to create attribution rule: ${error.message}`);
    }

    return {
      id: data.id,
      organizationId: data.organization_id,
      workloadId: data.workload_id,
      provider: data.provider,
      matchType: data.match_type,
      matchValue: data.match_value,
      createdAt: new Date(data.created_at)
    };
  }

  async listAttributionRules(organizationId: string, workloadId: string): Promise<AttributionRule[]> {
    // Ensure workload exists in org
    await this.getWorkload(organizationId, workloadId);

    const { data, error } = await this.supabase
      .from('attribution_rules')
      .select('*')
      .eq('workload_id', workloadId)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to list attribution rules: ${error.message}`);

    return data.map(d => ({
      id: d.id,
      organizationId: d.organization_id,
      workloadId: d.workload_id,
      provider: d.provider,
      matchType: d.match_type,
      matchValue: d.match_value,
      createdAt: new Date(d.created_at)
    }));
  }

  async deleteAttributionRule(organizationId: string, workloadId: string, ruleId: string): Promise<void> {
    // Ensure workload exists in org
    await this.getWorkload(organizationId, workloadId);

    const { error } = await this.supabase
      .from('attribution_rules')
      .delete()
      .eq('id', ruleId)
      .eq('workload_id', workloadId)
      .eq('organization_id', organizationId);

    if (error) throw new Error(`Failed to delete attribution rule: ${error.message}`);
  }
}
