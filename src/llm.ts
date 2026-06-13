import Groq from "groq-sdk";
import type { ReviewIssue, ReviewResponse, ReviewResult, ReviewSeverity } from "./types.js";

const MODEL_NAME = "llama-3.3-70b-versatile";

export async function generateReview(diff: string): Promise<ReviewResponse> {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("GROQ_API_KEY is required");
  }

  const groq = new Groq({ apiKey });
  const prompt = buildReviewPrompt(diff);
  const response = await groq.chat.completions.create({
    model: MODEL_NAME,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });
  const rawText = response.choices[0]?.message?.content ?? "";
  const parsed = parseReviewJson(rawText);

  return {
    rawText,
    parsed,
    markdown: parsed ? formatReviewAsMarkdown(parsed) : formatRawReviewFallback(rawText),
  };
}

function buildReviewPrompt(diff: string): string {
  return [
    "You are CodeSense, an automated senior code reviewer for GitHub pull requests.",
    "Review the unified diff below for code quality issues, potential bugs, and useful improvement suggestions.",
    "Return only valid JSON. Do not wrap the JSON in Markdown fences or add explanatory text.",
    "",
    "The JSON must use exactly this shape:",
    JSON.stringify(
      {
        summary: "Overall assessment in 2-3 sentences",
        issues: [
          {
            file: "filename",
            line: 42,
            severity: "error | warning | suggestion",
            comment: "Explanation of the issue",
          },
        ],
      },
      null,
      2,
    ),
    "",
    "Rules:",
    "- Use severity \"error\" for likely bugs or broken behavior.",
    "- Use severity \"warning\" for risky code, maintainability issues, or missing edge-case handling.",
    "- Use severity \"suggestion\" for optional improvements.",
    "- Keep comments concise and actionable.",
    "- If there are no issues, return an empty issues array.",
    "- Line numbers should refer to the changed file when possible.",
    "",
    "Unified diff:",
    "```diff",
    diff,
    "```",
  ].join("\n");
}

function parseReviewJson(rawText: string): ReviewResult | null {
  try {
    const parsed = JSON.parse(stripJsonCodeFence(rawText));

    if (!isReviewResult(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function stripJsonCodeFence(rawText: string): string {
  const trimmed = rawText.trim();
  const fencedJsonMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

  return fencedJsonMatch?.[1]?.trim() ?? trimmed;
}

function isReviewResult(value: unknown): value is ReviewResult {
  if (!isRecord(value)) {
    return false;
  }

  if (typeof value.summary !== "string" || !Array.isArray(value.issues)) {
    return false;
  }

  return value.issues.every(isReviewIssue);
}

function isReviewIssue(value: unknown): value is ReviewIssue {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.file === "string" &&
    typeof value.line === "number" &&
    isReviewSeverity(value.severity) &&
    typeof value.comment === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isReviewSeverity(value: unknown): value is ReviewSeverity {
  return value === "error" || value === "warning" || value === "suggestion";
}

function formatReviewAsMarkdown(review: ReviewResult): string {
  const sections = [
    "## Reviewr Aii",
    "",
    "### Summary",
    review.summary,
    "",
    "### Issues",
    formatIssuesTable(review.issues),
  ];

  return sections.join("\n");
}

function formatIssuesTable(issues: ReviewIssue[]): string {
  if (issues.length === 0) {
    return "No issues found.";
  }

  return [
    "| Severity | File | Line | Comment |",
    "| --- | --- | ---: | --- |",
    ...issues.map((issue) => {
      const cells = [
        severityLabel(issue.severity),
        escapeMarkdownTableCell(issue.file),
        String(issue.line),
        escapeMarkdownTableCell(issue.comment),
      ];

      return `| ${cells.join(" | ")} |`;
    }),
  ].join("\n");
}

function severityLabel(severity: ReviewSeverity): string {
  switch (severity) {
    case "error":
      return ":rotating_light: error";
    case "warning":
      return ":warning: warning";
    case "suggestion":
      return ":bulb: suggestion";
  }
}

function escapeMarkdownTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

function formatRawReviewFallback(rawText: string): string {
  return [
    "## Reviewr Aii",
    "",
    "Groq returned a response that could not be parsed as the expected JSON shape. Raw response:",
    "",
    "```",
    rawText.trim(),
    "```",
  ].join("\n");
}
