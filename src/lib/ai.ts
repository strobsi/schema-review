import { z, ZodSchema } from 'zod';
import { getInput } from '@actions/core';
import { getProvider } from '@/ai-models';
import * as core from '@actions/core';

export async function sendPromptToModel(
  systemPrompt: string,
  promptText: string,
  schema: ZodSchema
): Promise<z.infer<typeof schema>> {
  try {
    const provider = getInput('provider') || 'openai';
    const model = getInput('model') || 'o4-mini';
    const apiKey = getInput('api_key') || process.env.API_KEY || '';

    core.info(`Sending prompt to model ${model} with provider ${provider}`);

    const { generateObject, validateModel } = getProvider(provider, {
      modelId: model,
      apiKey: apiKey,
    });

    // const { isValidModel, listOfModels } = await validateModel(model);

    // if (!isValidModel) {
    //   throw new Error(`Model ${model} is not supported. Supported models: ${listOfModels.join(', ')}`);
    // }

    const { object } = await generateObject(
      [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: promptText,
        },
      ],
      schema
    );
    return object;
  } catch (error) {
    console.error('Error calling AI model or processing structured output:', error);
    // It's good practice to throw a more specific error or handle it appropriately
    throw new Error('Failed to get a valid structured response from the AI model.');
  }
}
