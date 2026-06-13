import type { Request, Response } from "express";
import { Webhooks, createNodeMiddleware } from "@octokit/webhooks";
import type { EmitterWebhookEvent } from "@octokit/webhooks";
import { fetchPullRequestDiff, postPullRequestComment } from "./github.js";
import { generateReview } from "./llm.js";
import type { PullRequestReviewInput } from "./types.js";

type PullRequestEvent = EmitterWebhookEvent<"pull_request">;
type PullRequestPayload = PullRequestEvent["payload"] & {
  installation?: {
    id: number;
  };
};

const REVIEWABLE_PULL_REQUEST_ACTIONS = new Set(["opened", "synchronize"]);

export function createWebhookMiddleware() {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;

  if (!secret) {
    throw new Error("GITHUB_WEBHOOK_SECRET is required");
  }

  const webhooks = new Webhooks({ secret });

  webhooks.on("pull_request", async (event) => {
    await handlePullRequestEvent(event);
  });

  webhooks.onError((error) => {
    console.error("GitHub webhook processing failed", error);
  });

  return createNodeMiddleware(webhooks, {
    path: "/webhook",
  }) as unknown as (req: Request, res: Response) => void;
}

async function handlePullRequestEvent(event: PullRequestEvent): Promise<void> {
  const { action, repository, pull_request: pullRequest, installation } =
    event.payload as PullRequestPayload;

  if (!REVIEWABLE_PULL_REQUEST_ACTIONS.has(action)) {
    return;
  }

  if (!installation?.id) {
    throw new Error("Pull request webhook payload is missing installation.id");
  }

  await runPullRequestReview({
    installationId: installation.id,
    owner: repository.owner.login,
    repo: repository.name,
    pullNumber: pullRequest.number,
  });
}

async function runPullRequestReview(input: PullRequestReviewInput): Promise<void> {
  const diff = await fetchPullRequestDiff(input);

  if (!diff.trim()) {
    console.log(`Skipping ${input.owner}/${input.repo}#${input.pullNumber}: no reviewable diff`);
    return;
  }

  const review = await generateReview(diff);

  await postPullRequestComment({
    ...input,
    body: review.markdown,
  });
}
