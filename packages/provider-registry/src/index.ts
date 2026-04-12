import type { MatchContext, ProviderPlugin } from '@llmscope/core';

export interface MatchedProvider {
  plugin: ProviderPlugin;
  provider: string;
  apiStyle: string;
  confidence: number;
  reasons: string[];
}

export interface ProviderRegistry {
  readonly plugins: ProviderPlugin[];
  readonly minimumConfidence: number;
  match(_context: MatchContext): MatchedProvider | undefined;
}

export interface CreateProviderRegistryOptions {
  plugins?: ProviderPlugin[];
  minimumConfidence?: number;
}

export const createProviderRegistry = (
  options: CreateProviderRegistryOptions = {},
): ProviderRegistry => {
  const plugins = options.plugins ?? [];
  const minimumConfidence = options.minimumConfidence ?? 0.5;

  return {
    plugins,
    minimumConfidence,
    match(context) {
      let bestMatch: MatchedProvider | undefined;

      for (const plugin of plugins) {
        const result = plugin.match(context);

        if (result === null || result.confidence < minimumConfidence) {
          continue;
        }

        if (
          bestMatch === undefined ||
          result.confidence > bestMatch.confidence ||
          (result.confidence === bestMatch.confidence &&
            plugin.id < bestMatch.plugin.id)
        ) {
          bestMatch = {
            plugin,
            provider: result.provider,
            apiStyle: result.apiStyle,
            confidence: result.confidence,
            reasons: result.reasons,
          };
        }
      }

      return bestMatch;
    },
  };
};
