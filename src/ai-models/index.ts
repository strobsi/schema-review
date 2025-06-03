import { OpenAIProvider } from '@/ai-models/openai';
import { GoogleProvider } from '@/ai-models/google';
import { AnthropicProvider } from '@/ai-models/anthropic';
import type { AIProviderOptions } from '@/ai-models/ai-provider';

export function getProvider(provider: string, options: AIProviderOptions) {
  switch (provider) {
    case 'openai':
      return new OpenAIProvider({
        ...options,
        modelId: options.modelId,
      });
    case 'google':
      return new GoogleProvider({
        ...options,
        modelId: options.modelId,
      });
    case 'anthropic':
      return new AnthropicProvider({
        ...options,
        modelId: options.modelId,
      });
    default:
      throw new Error(`Provider ${provider} not supported`);
  }
}
