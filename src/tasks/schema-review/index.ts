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
  core.info(`failureThresholdInput: ${failureThresholdInput}`);
  const failureThreshold = parseInt(failureThresholdInput, 10);
  const CATALOG_PATH = path.join(process.cwd(), catalogDirectory);
  core.info(`Catalog directory: ${catalogDirectory}`);
  const owner = context.repo.owner;
  core.info(`Repository owner: ${owner}`);
  const repo = context.repo.repo;
  core.info(`Repository: ${owner}/${repo}`);
  const pullRequestNumber = context.payload.pull_request!.number;
  core.info(`Pull request number: ${pullRequestNumber}`);
  const model = core.getInput('model');
  core.info(`Model: ${model}`);
  const provider = core.getInput('provider');
  core.info(`Provider: ${provider}`);
  const catalogFolderName = core.getInput('catalog_directory');
  core.info(`Catalog folder name: ${catalogFolderName}`);
  const { getMessageBySchemaPath, getProducersAndConsumersForMessage } = utils(CATALOG_PATH);

  core.info(`Catalog path: ${CATALOG_PATH}`);

  if (isNaN(failureThreshold) || failureThreshold < 0 || failureThreshold > 100) {
    core.setFailed('Invalid input for `failure_threshold`. Must be a number between 0 and 100.');
    return;
  }

  const changedEventCatalogFilesInPullRequest = await getChangedFilesInCatalogDirectory(octokit, context, catalogDirectory);
  const changedSchemasInPullRequest = changedEventCatalogFilesInPullRequest;

  if (changedSchemasInPullRequest.length === 0) {
    core.info('No schemas have changed, skipping schema review');
    //return;
  }

  const reviewedFiles: ReviewedFile[] = [];

  // Review all the schemas, the new schema vs the old one
  for (const filePath of changedSchemasInPullRequest) {
    try {
      core.info(`Reviewing schema: ${filePath}`);
      const message = await getMessageBySchemaPath(filePath);
      const { consumers = [] } = await getProducersAndConsumersForMessage(message.id, message.version);
      core.info(`Message consumers: ${consumers.map((c) => `${c.name} (${c.version})`).join(', ')}`);
      const schemaReviewResponse = await reviewSchema(octokit, context, filePath, consumers);
      reviewedFiles.push(schemaReviewResponse);
    } catch (error) {
      core.error(`Error reviewing schema: ${filePath}`);
      core.error(error instanceof Error ? error.message : String(error));
      core.setFailed(`Error reviewing schema: ${filePath}`);
      return;
    }
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
    `https://git.t3.daimlertruck.com/${owner}/${repo}/pull/${pullRequestNumber}#issuecomment-${newOrUpdatedCommentId}`
  );

  if (lowestScore < failureThreshold) {
    core.setFailed(`Schema review failed with a score of ${lowestScore}`);
    return;
  }
};
