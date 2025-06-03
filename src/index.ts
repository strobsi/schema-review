import * as core from '@actions/core';
import * as github from '@actions/github';
import { getChangedFilesInCatalogDirectory } from '@/lib/github';
import { VALID_TASKS, schemaReviewTask } from '@/tasks';
import checkLicense from '@/license/check-license';

async function run(): Promise<void> {
  try {
    const githubToken = core.getInput('github_token', { required: true });
    const octokit = github.getOctokit(githubToken);
    const context = github.context;
    const catalogDirectory = core.getInput('catalog_directory');
    const task = core.getInput('task');
    const licenseKey = core.getInput('license_key');

    try {
      await checkLicense('@eventcatalog/eventcatalog-scale', licenseKey);
    } catch (error) {
      await octokit.rest.issues.createComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: context.payload.pull_request!.number,
        body: 'Invalid license key for EventCatalog GitHub Action, please check your license key or get a 14 day free trial at https://eventcatalog.cloud/.',
      });
      core.setFailed('Invalid license key for EventCatalog GitHub Action, please check your license key or get a 14 day free trial at https://eventcatalog.cloud/.');
      return;
    }

    if (!VALID_TASKS.includes(task)) {
      core.setFailed(`Invalid input for \`task\`. Must be one of: ${VALID_TASKS.join(', ')}.`);
      return;
    }

    const changedFilesForCatalog = await getChangedFilesInCatalogDirectory(octokit, context, catalogDirectory || undefined);

    if (changedFilesForCatalog.length === 0) {
      core.info('No catalog files have changes, skipping all tasks in action.');
      return;
    }

    switch (task) {
      case 'schema_review':
        await schemaReviewTask({ octokit, context, catalogDirectory });
        break;
      default:
        core.setFailed(`Invalid input for \`task\`. Must be one of: ${VALID_TASKS.join(', ')}.`);
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    }
  }
}

run();
