import * as core from '@actions/core';
import type { GitHub } from '@actions/github/lib/utils';
import utils, { Message } from '@eventcatalog/sdk';
import path from 'path';

import { getChangedFilesInCatalogDirectory, ReviewedFile, upsertComment } from '@/lib/github';
import { Context } from '@actions/github/lib/context';
import { getSchemasFromFilePaths } from '@/lib/eventcatalog';
import { reviewSchema } from './review';
import { generateGitHubCommentForSchemaReview } from './github-comment';

const COMMENT_MARKER = '<!-- eventcatalog-schema-review-comment -->';

interface TaskParams {
  octokit: InstanceType<typeof GitHub>;
  context: Context;
  catalogDirectory: string;
}

export const task = async ({ octokit, context, catalogDirectory }: TaskParams) => {
  const failureThresholdInput = core.getInput('failure_threshold');
  const failureThreshold = parseInt(failureThresholdInput, 10);
  const CATALOG_PATH = path.join(process.cwd(), catalogDirectory);

  const owner = context.repo.owner;
  const repo = context.repo.repo;
  const pullRequestNumber = context.payload.pull_request!.number;
  const commentId = context.payload.comment?.id;
  const model = core.getInput('model');
  const provider = core.getInput('provider');
  const catalogFolderName = core.getInput('catalog_directory');

  const { getMessageBySchemaPath, getProducersAndConsumersForMessage } = utils(CATALOG_PATH);

  core.info(`Catalog path: ${CATALOG_PATH}`);

  if (isNaN(failureThreshold) || failureThreshold < 0 || failureThreshold > 100) {
    core.setFailed('Invalid input for `failure_threshold`. Must be a number between 0 and 100.');
    return;
  }

  const changedEventCatalogFilesInPullRequest = await getChangedFilesInCatalogDirectory(octokit, context, catalogDirectory);
  const changedSchemasInPullRequest = getSchemasFromFilePaths(changedEventCatalogFilesInPullRequest);

  if (changedSchemasInPullRequest.length === 0) {
    core.info('No schemas have changed, skipping schema review');
    return;
  }

  let consumers: Message[] = [];

  try {
    for (const filePath of changedSchemasInPullRequest) {
      const relativeFilePath = filePath.replace(catalogFolderName, '');
      const message = await getMessageBySchemaPath(relativeFilePath);
      const { consumers: messageConsumers } = await getProducersAndConsumersForMessage(message.id, message.version);
      consumers.push(...messageConsumers);
    }
  } catch (error) {
    core.setFailed(`Failed to get messages for schemas: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  const reviewedFiles: ReviewedFile[] = [];

  // Review all the schemas, the new schema vs the old one
  for (const filePath of changedSchemasInPullRequest) {
    const reviewedFileEntry = await reviewSchema(octokit, context, filePath, consumers);
    reviewedFiles.push(reviewedFileEntry);
  }

  // Get the lowest score for any of the reviewed files, compare to the failure threshold
  const lowestScore = reviewedFiles.reduce((min, file) => Math.min(min, file.aiReview?.score || 100), 100);

  // Order reviewed files by score (lowest to highest)
  const orderedReviewedFiles = reviewedFiles.sort((a, b) => (a.aiReview?.score || 100) - (b.aiReview?.score || 100));

  const commentBody = await generateGitHubCommentForSchemaReview({
    context,
    reviewedFiles: orderedReviewedFiles,
    model,
    provider,
    catalogDirectory,
  });

  const newOrUpdatedCommentId = await upsertComment(octokit, context, pullRequestNumber, commentBody, COMMENT_MARKER);

  core.setOutput(
    'comment-url',
    `https://github.com/${owner}/${repo}/pull/${pullRequestNumber}#issuecomment-${newOrUpdatedCommentId}`
  );

  if (lowestScore < failureThreshold) {
    core.setFailed(`Schema review failed with a score of ${lowestScore}`);
    return;
  }
};
