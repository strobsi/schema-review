import * as core from '@actions/core';
import { Buffer } from 'buffer'; // Needed for Buffer.from
import path from 'path';
import type { GitHub } from '@actions/github/lib/utils';
import type { Context } from '@actions/github/lib/context';

// Define a simple interface for the file object from Octokit
interface OctokitFile {
  filename: string;
}

// Interface for AI Review data (matching the updated AiResponseSchema in ai.ts)
export interface AiReview {
  executiveSummary: string;
  effectedConsumers: {
    name: string;
    version: string;
    warning: string;
  }[];
  score: number;
  schemaFormat: string;
}

export interface ReviewedFile {
  filePath: string;
  oldFileContent: string;
  newFileContent: string;
  aiReview?: AiReview;
  aiError?: string;
}

export interface InitialChecksResult {
  changedFilePaths: string[];
  shouldContinue: boolean;
}

function containsDirectory(targetPath: string, directoryName: string) {
  const normalizedPath = path.normalize(targetPath);
  const segments = normalizedPath.split(path.sep);
  return segments.includes(directoryName);
}

// Helper function to get file content at a specific ref
export async function getFileContentAtRef(octokit: any, context: Context, path: string, ref: string): Promise<string> {
  const owner = context.repo.owner;
  const repo = context.repo.repo;

  try {
    const { data: contentResponse } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });

    if ('content' in contentResponse && contentResponse.content) {
      if (contentResponse.encoding === 'base64') {
        return Buffer.from(contentResponse.content, 'base64').toString('utf-8');
      }
      return contentResponse.content;
    } else if (Array.isArray(contentResponse)) {
      return 'This is a directory, content not displayed.';
    }
    return 'Could not retrieve content for this file.';
  } catch (error: any) {
    core.warning(`Failed to fetch content for ${path} at ref ${ref}: ${error.mreessage}`);
    return `Could not retrieve content (Error: ${error.message})`;
  }
}

/**
 * Get the changed files in the catalog directory
 * @param octokit - The octokit instance
 * @param context - The context object
 * @param catalogDirectory - The catalog directory
 * @returns The changed files in the catalog directory
 */
export async function getChangedFilesInCatalogDirectory(
  octokit: InstanceType<typeof GitHub>,
  context: Context,
  catalogDirectory: string | undefined
): Promise<string[]> {
  const { data: files } = await octokit.rest.pulls.listFiles({
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number: context.payload.pull_request!.number,
  });
  core.info(`Found ${files.length} changed files in the pull request.`);

  let changedFiles = files.map((file: OctokitFile) => file.filename);
  core.info(`Changed files: ${changedFiles.join(', ')}`);

  if (catalogDirectory) {
    core.info(`Filtering changed files for directory: ${catalogDirectory}`);
    // The path is inside the catalogDirectory somewhere
    changedFiles = changedFiles.filter((file: string) => containsDirectory(file, catalogDirectory));
  }
  core.info(`Filtered changed files: ${changedFiles.join(', ')}`);

  return changedFiles;
}

export async function upsertComment(
  octokit: InstanceType<typeof GitHub>,
  context: Context,
  pullRequestNumber: number,
  commentBody: string,
  commentMarker: string
): Promise<number> {
  const owner = context.repo.owner;
  const repo = context.repo.repo;

  let existingCommentId: number | undefined;

  try {
    const { data: comments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: pullRequestNumber,
    });
    for (const comment of comments) {
      if (comment.body?.includes(commentMarker)) {
        existingCommentId = comment.id;
        break;
      }
    }
  } catch (error) {
    core.warning(
      `Failed to list comments: ${error instanceof Error ? error.message : String(error)}. Proceeding to create a new comment.`
    );
  }

  if (existingCommentId) {
    core.info(`Updating existing comment id: ${existingCommentId}`);
    const { data: updatedComment } = await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existingCommentId,
      body: commentBody,
    });
    return updatedComment.id;
  } else {
    core.info('Creating new comment');
    const { data: newComment } = await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: pullRequestNumber,
      body: commentBody,
    });
    return newComment.id;
  }
}
