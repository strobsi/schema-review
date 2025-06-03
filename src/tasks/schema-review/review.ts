import * as core from '@actions/core';
import { ReviewedFile, getFileContentAtRef } from '@/lib/github';
import { sendPromptToModel } from '@/lib/ai';
import { GitHub } from '@actions/github/lib/utils';
import { Context } from '@actions/github/lib/context';
import { Message } from '@eventcatalog/sdk';

import { getSystemPromptForSchemaReview, getUserPromptForSchemaReview, responseSchema } from './prompt';

export const reviewSchema = async (
  octokit: InstanceType<typeof GitHub>,
  context: Context,
  schemaFilePath: string,
  messages: Message[]
): Promise<ReviewedFile> => {
  core.info(`Performing schema review for file: ${schemaFilePath}`);

  const baseSha = context.payload.pull_request!.base.sha;
  const headSha = context.payload.pull_request!.head.sha;

  const previousFileContent = await getFileContentAtRef(octokit, context, schemaFilePath, baseSha);
  const newFileContent = await getFileContentAtRef(octokit, context, schemaFilePath, headSha);

  const systemPrompt = getSystemPromptForSchemaReview();

  const userPrompt = getUserPromptForSchemaReview(previousFileContent, newFileContent, messages);

  let reviewedFileEntry: ReviewedFile = {
    filePath: schemaFilePath,
    oldFileContent: previousFileContent,
    newFileContent,
  };

  try {
    core.info(`Requesting AI review for schema changes in ${schemaFilePath}...`);
    const response = await sendPromptToModel(systemPrompt, userPrompt, responseSchema);
    core.info(`AI review received for ${schemaFilePath}: Score ${response.score}`);
    reviewedFileEntry.aiReview = response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    core.error(`AI review failed for ${schemaFilePath}: ${errorMessage}`);
    reviewedFileEntry.aiError = errorMessage;
  }
  return reviewedFileEntry;
};
