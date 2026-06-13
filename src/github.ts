import { App } from "octokit";
import type { PullRequestReviewInput } from "./types.js";

const MAX_FILE_DIFF_LINES = 300;

const LOCK_FILE_PATTERNS = [
  /(^|\/)package-lock\.json$/i,
  /(^|\/)npm-shrinkwrap\.json$/i,
  /(^|\/)yarn\.lock$/i,
  /(^|\/)pnpm-lock\.yaml$/i,
  /(^|\/)bun\.lockb$/i,
  /(^|\/)composer\.lock$/i,
  /(^|\/)Gemfile\.lock$/i,
  /(^|\/)poetry\.lock$/i,
  /(^|\/)Pipfile\.lock$/i,
  /(^|\/)Cargo\.lock$/i,
  /(^|\/)go\.sum$/i,
];

const GENERATED_FILE_PATTERNS = [
  /(^|\/)dist\//i,
  /(^|\/)build\//i,
  /(^|\/)coverage\//i,
  /(^|\/)vendor\//i,
  /(^|\/)node_modules\//i,
  /(^|\/)\.next\//i,
  /(^|\/)\.turbo\//i,
  /(^|\/)generated\//i,
  /(^|\/)__generated__\//i,
  /\.generated\.[^.]+$/i,
  /\.gen\.[^.]+$/i,
  /\.min\.(js|css)$/i,
];

export async function fetchPullRequestDiff(input: PullRequestReviewInput): Promise<string> {
  const octokit = await getInstallationOctokit(input.installationId);

  const response = await octokit.request(
    "GET /repos/{owner}/{repo}/pulls/{pull_number}",
    {
      owner: input.owner,
      repo: input.repo,
      pull_number: input.pullNumber,
      mediaType: {
        format: "diff",
      },
    },
  );

  return filterUnifiedDiff(String(response.data));
}

export async function postPullRequestComment(input: {
  installationId: PullRequestReviewInput["installationId"];
  owner: PullRequestReviewInput["owner"];
  repo: PullRequestReviewInput["repo"];
  pullNumber: PullRequestReviewInput["pullNumber"];
  body: string;
}): Promise<void> {
  const octokit = await getInstallationOctokit(input.installationId);

  await octokit.rest.issues.createComment({
    owner: input.owner,
    repo: input.repo,
    issue_number: input.pullNumber,
    body: input.body,
  });
}

function getApp(): App {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_PRIVATE_KEY;

  if (!appId) {
    throw new Error("GITHUB_APP_ID is required");
  }

  if (!privateKey) {
    throw new Error("GITHUB_PRIVATE_KEY is required");
  }

  return new App({
    appId,
    privateKey: normalizePrivateKey(privateKey),
  });
}

async function getInstallationOctokit(installationId: number) {
  return getApp().getInstallationOctokit(installationId);
}

function normalizePrivateKey(privateKey: string): string {
  return privateKey.replace(/\\n/g, "\n");
}

function filterUnifiedDiff(diff: string): string {
  const fileDiffs = splitUnifiedDiffByFile(diff);

  return fileDiffs
    .filter((fileDiff) => shouldIncludeFileDiff(fileDiff))
    .map((fileDiff) => fileDiff.content)
    .join("\n");
}

function splitUnifiedDiffByFile(diff: string): Array<{ filename: string; content: string }> {
  const lines = diff.split("\n");
  const fileDiffs: Array<{ filename: string; content: string[] }> = [];
  let currentFileDiff: { filename: string; content: string[] } | undefined;

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      if (currentFileDiff) {
        fileDiffs.push(currentFileDiff);
      }

      currentFileDiff = {
        filename: extractFilenameFromDiffHeader(line),
        content: [line],
      };
      continue;
    }

    currentFileDiff?.content.push(line);
  }

  if (currentFileDiff) {
    fileDiffs.push(currentFileDiff);
  }

  return fileDiffs.map((fileDiff) => ({
    filename: fileDiff.filename,
    content: fileDiff.content.join("\n"),
  }));
}

function extractFilenameFromDiffHeader(header: string): string {
  const match = header.match(/^diff --git a\/(.+?) b\/(.+)$/);

  if (!match) {
    return "";
  }

  return match[2] ?? match[1] ?? "";
}

function shouldIncludeFileDiff(fileDiff: { filename: string; content: string }): boolean {
  if (!fileDiff.filename) {
    return false;
  }

  if (matchesAnyPattern(fileDiff.filename, LOCK_FILE_PATTERNS)) {
    return false;
  }

  if (matchesAnyPattern(fileDiff.filename, GENERATED_FILE_PATTERNS)) {
    return false;
  }

  return countChangedLines(fileDiff.content) <= MAX_FILE_DIFF_LINES;
}

function matchesAnyPattern(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function countChangedLines(fileDiff: string): number {
  return fileDiff.split("\n").filter((line) => {
    if (line.startsWith("+++") || line.startsWith("---")) {
      return false;
    }

    return line.startsWith("+") || line.startsWith("-");
  }).length;
}
