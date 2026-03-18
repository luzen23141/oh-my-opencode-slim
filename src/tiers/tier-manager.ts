import type { PluginConfig } from '../config';
import { ALL_AGENT_NAMES } from '../config/constants';
import { getAgentOverride } from '../config/utils';
import { log } from '../utils/logger';

export type { TierLevel } from '../config/schema';

export interface TierStatus {
  tiers: Record<string, string>;
  agents: Array<{
    name: string;
    tier: string | null;
    resolvedModel: string | null;
  }>;
}

/**
 * Manages runtime model tier assignments.
 *
 * Tiers are user-defined string keys (e.g. "fast", "smart", "cheap").
 * Each tier maps to a model ID. The mapping can be switched at runtime
 * via the set_tier tool.
 *
 * orchestrator is excluded: it has no background_task path.
 * Agent-tier mapping is snapshotted from config at construction time.
 * Only tierMap is mutable at runtime.
 */
export class TierManager {
  private tierMap: Map<string, string>;
  private agentTierMap: Map<string, string>;

  constructor(config?: PluginConfig) {
    // Initialize tier map from config (user-defined keys)
    this.tierMap = new Map(Object.entries(config?.tiers ?? {}));

    // Build agent → tier snapshot using getAgentOverride to respect aliases.
    this.agentTierMap = new Map();
    for (const name of ALL_AGENT_NAMES) {
      const override = getAgentOverride(config, name);
      if (!override?.tier) continue;
      if (name === 'orchestrator') {
        log(
          '[tier-manager] warning: orchestrator.tier is ignored — set model directly',
        );
        continue;
      }
      // model takes priority: if agent has explicit model, tier is ignored
      if (override.model !== undefined) {
        log(
          `[tier-manager] warning: agent "${name}" has both model and tier — tier ignored`,
        );
        continue;
      }
      // Validate tier key exists in tiers config
      if (!this.tierMap.has(override.tier)) {
        log(
          `[tier-manager] warning: agent "${name}" uses tier "${override.tier}" which is not defined in tiers — ignored`,
        );
        continue;
      }
      this.agentTierMap.set(name, override.tier);
    }

    log('[tier-manager] initialized', {
      tiers: Object.fromEntries(this.tierMap),
      agentTiers: Object.fromEntries(this.agentTierMap),
    });
  }

  /**
   * Resolve the current model for an agent based on its configured tier.
   * Returns undefined if the agent has no tier, or the tier has no model.
   */
  resolve(agentName: string): string | undefined {
    const tier = this.agentTierMap.get(agentName);
    if (!tier) return undefined;

    const model = this.tierMap.get(tier);
    if (!model) {
      log(
        `[tier-manager] warning: tier "${tier}" for agent "${agentName}" has no model defined`,
      );
      return undefined;
    }

    log(
      `[tier-manager] resolved agent="${agentName}" tier="${tier}" model="${model}"`,
    );
    return model;
  }

  /**
   * Update the active model for a tier at runtime.
   */
  setTier(tier: string, model: string): void {
    this.tierMap.set(tier, model);
    log(`[tier-manager] set tier="${tier}" model="${model}"`);
  }

  /**
   * Check if a tier key is defined.
   */
  hasTier(tier: string): boolean {
    return this.tierMap.has(tier);
  }

  /**
   * Return current tier map and per-agent status for display.
   */
  getStatus(): TierStatus {
    const agents = ALL_AGENT_NAMES.map((name) => {
      const tier = this.agentTierMap.get(name) ?? null;
      return {
        name,
        tier,
        resolvedModel: tier ? (this.tierMap.get(tier) ?? null) : null,
      };
    });

    return {
      tiers: Object.fromEntries(this.tierMap),
      agents,
    };
  }
}
