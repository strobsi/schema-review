import { ReviewedFile } from '@/lib/github';
import mustache from 'mustache';
import { Context } from '@actions/github/lib/context';
import utils from '@eventcatalog/sdk';
import { getInput } from '@actions/core';

const COMMENT_MARKER = '<!-- eventcatalog-schema-review-comment -->';

const TEMPLATE = `
# EYWA: Schema Review

The following schemas were modified in this pull request:
{{#reviewedFiles}}

## [{{{name}}} ({{{version}}}) ({{{scorePrefix}}})]({{{fileDiffLink}}})

| Schema Format | Risk Score |
|---------------|------------|
| {{{aiReview.schemaFormat}}} | {{{aiReview.score}}}/100 |

{{aiReview.executiveSummary}}

{{#hasEffectedConsumers}}
### Potential Effected Consumers

{{#aiReview.effectedConsumers}}
- {{name}} ({{version}}) - {{warning}}
{{/aiReview.effectedConsumers}}
{{/hasEffectedConsumers}}
{{^hasEffectedConsumers}}
### Potential Effected Consumers

{{name}} ({{version}}) has no consumers mapped in EYWA.
{{/hasEffectedConsumers}}
{{/reviewedFiles}}

<sub>Using Model: {{model}} | Provider: {{provider}}</sub>
${COMMENT_MARKER}`;

export const generateGitHubCommentForSchemaReview = async ({
  context,
  reviewedFiles,
  model,
  provider,
  catalogDirectory,
}: {
  context: Context;
  reviewedFiles: ReviewedFile[];
  model: string;
  provider: string;
  catalogDirectory: string;
}) => {
  const { getMessageBySchemaPath } = utils(catalogDirectory);
  const catalogFolderName = getInput('catalog_directory');

  const getScorePrefix = (score: number) => {
    if (score < 50) {
      return '🚨 Danger';
    } else if (score < 80) {
      return '⚠️ Warning';
    } else {
      return '✅ Safe';
    }
  };

  const messages = await Promise.all(
    reviewedFiles.map(async (file) => {
      const relativeFilePath = file.filePath.replace(catalogFolderName, '');
      const message = await getMessageBySchemaPath(relativeFilePath);
      return {
        ...file,
        name: message.name,
        version: message.version,
      };
    })
  );

  const data = messages.map((file) => ({
    ...file,
    scorePrefix: getScorePrefix(file.aiReview?.score || 100),
    fileDiffLink: `https://git.t3.daimlertruck.com/${context.repo.owner}/${context.repo.repo}/pull/${context.payload.pull_request?.number}/files#${encodeURIComponent(file.filePath)}`,
    hasEffectedConsumers: (file.aiReview?.effectedConsumers?.length || 0) > 0,
  }));

  const commentBody = mustache.render(TEMPLATE, {
    reviewedFiles: data,
    model,
    provider,
    catalogDirectory,
  });

  return commentBody;
};
