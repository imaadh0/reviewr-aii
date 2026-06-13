export interface PullRequestReviewInput {
  installationId: number;
  owner: string;
  repo: string;
  pullNumber: number;
}

export type ReviewSeverity = "error" | "warning" | "suggestion";

export interface ReviewIssue {
  file: string;
  line: number;
  severity: ReviewSeverity;
  comment: string;
}

export interface ReviewResult {
  summary: string;
  issues: ReviewIssue[];
}

export interface ReviewResponse {
  markdown: string;
  rawText: string;
  parsed: ReviewResult | null;
}
