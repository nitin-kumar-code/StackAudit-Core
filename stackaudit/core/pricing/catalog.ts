import { PricingRecord } from '../types';
import { IPricingCatalog } from './types';
import { PricingNotFoundError, AmbiguousPricingError } from './errors';

export class InMemoryPricingCatalog implements IPricingCatalog {
  private records: PricingRecord[] = [];

  constructor(records: PricingRecord[] = []) {
    this.records = records;
  }

  public async findEffectivePrice(
    provider: string,
    model: string,
    timestamp: Date
  ): Promise<PricingRecord> {
    const time = timestamp.getTime();
    
    // Filter matching provider and model
    const candidates = this.records.filter(r => r.provider === provider && r.model === model);
    
    // Filter by effective window [effectiveFrom, effectiveUntil)
    const active = candidates.filter(r => {
      const from = r.effectiveFrom.getTime();
      const until = r.effectiveUntil ? r.effectiveUntil.getTime() : null;
      
      if (time < from) return false;
      if (until !== null && time >= until) return false;
      
      return true;
    });

    if (active.length === 0) {
      throw new PricingNotFoundError(provider, model, timestamp);
    }

    if (active.length > 1) {
      const ids = active.map(r => r.id);
      throw new AmbiguousPricingError(provider, model, timestamp, ids);
    }

    return active[0];
  }
}
