import { type ToolDefinition, tool } from '@opencode-ai/plugin';
import type { TierManager } from '../tiers';

const z = tool.schema;

/**
 * Creates tier management tools for displaying and switching model tiers.
 */
export function createTierTools(
  tierManager: TierManager,
): Record<string, ToolDefinition> {
  const show_tiers = tool({
    description: `Show current model tier configuration.

Displays:
- Active model for each tier (mid / low)
- Each agent's assigned tier and resolved model
- Agents with no tier (model set directly or using default)`,

    args: {},
    async execute() {
      const status = tierManager.getStatus();

      const tierLines = Object.entries(status.tiers)
        .map(([tier, model]) => `  ${tier}: ${model}`)
        .join('\n');

      const tieredAgents = status.agents.filter((a) => a.tier !== null);
      const untieredAgents = status.agents.filter((a) => a.tier === null);

      const agentLines = tieredAgents
        .map((a) => `  ${a.name}: tier=${a.tier} → ${a.resolvedModel}`)
        .join('\n');

      const noTierLine = untieredAgents.map((a) => a.name).join(', ');

      const parts = [
        '## Current Tier Configuration',
        '',
        '### Tier → Model',
        tierLines || '  (none configured)',
        '',
        '### Agents with Tier',
        agentLines || '  (none)',
      ];

      if (noTierLine) {
        parts.push('', `### Agents without Tier\n  ${noTierLine}`);
      }

      return parts.join('\n');
    },
  });

  const set_tier = tool({
    description: `Switch the active model for a tier at runtime.

Changes take effect immediately for all subsequent background_task calls.
Note: does NOT affect OpenCode's built-in task tool or the current running task.
Does not affect the orchestrator (high tier — set model directly in config).
By default this tool is only allowed for the orchestrator via agent permissions.
If you override permissions manually, behavior follows your permission config.

Example: set_tier mid openai/gpt-5.4`,

    args: {
      tier: z
        .string()
        .min(1)
        .describe('Tier name to update (must be defined in config.tiers)'),
      model: z
        .string()
        .regex(
          /^[^/\s]+\/[^\s]+$/,
          'Expected provider/model format (e.g. openai/gpt-5-codex)',
        )
        .describe('Model ID in provider/model format'),
    },
    async execute(args) {
      if (!tierManager.hasTier(args.tier)) {
        const status = tierManager.getStatus();
        const available = Object.keys(status.tiers).join(', ') || '(none)';
        return `Tier "${args.tier}" is not defined. Available tiers: ${available}`;
      }

      tierManager.setTier(args.tier, args.model);

      return `Tier updated.\n\n  ${args.tier} → ${args.model}\n\nAll subsequent background_task calls using the "${args.tier}" tier will use this model.`;
    },
  });

  return { show_tiers, set_tier };
}
