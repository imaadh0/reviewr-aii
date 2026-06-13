# Reviewr Aii

Reviewr Aii is a GitHub App that automatically reviews pull requests with an LLM. When a pull request is opened or updated, GitHub sends a webhook to the Express server, Reviewr Aii fetches the PR diff, sends the filtered diff to an LLM, and posts a structured review comment back on the pull request.

## Example

The screenshot below shows Reviewr Aii posting a structured pull request review with a summary and issue table.

![Reviewr Aii PR review example](docs/comment.jpg)

## Features

- Verifies GitHub webhook signatures with `GITHUB_WEBHOOK_SECRET`.
- Handles `pull_request` events for `opened` and `synchronize` actions.
- Fetches pull request diffs through an installation-scoped GitHub App client.
- Filters noisy diff content such as lock files, generated files, build outputs, and files over 300 changed lines.
- Sends the cleaned diff to an LLM for review.
- Requests a structured JSON review with a summary and issue list.
- Posts a markdown review comment with severity, file, line, and comment columns.
- Falls back to posting the raw LLM response if structured JSON parsing fails.

## Tech Stack

- Node.js
- Express
- TypeScript
- Octokit
- `@octokit/webhooks`
- LLM API integration
- dotenv
- Railway-ready deployment

## Project Structure

```text
reviewr-aii/
|-- src/
|   |-- index.ts
|   |-- webhook.ts
|   |-- github.ts
|   |-- llm.ts
|   `-- types.ts
|-- docs/
|   `-- comment.jpg
|-- package.json
|-- package-lock.json
|-- tsconfig.json
`-- README.md
```

## Environment Variables

Create a `.env` file for local development:

```env
GITHUB_APP_ID=
GITHUB_PRIVATE_KEY=
GITHUB_WEBHOOK_SECRET=
LLM_API_KEY=
PORT=3000
```

For `GITHUB_PRIVATE_KEY`, keep the private key as a single environment variable. Escaped newlines are supported:

```env
GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
```

## GitHub App Setup

Create a GitHub App and configure:

- Webhook URL: `https://YOUR_DOMAIN/webhooks/github`
- Webhook secret: same value as `GITHUB_WEBHOOK_SECRET`
- Subscribe to events: `Pull request`
- Repository permissions:
  - Pull requests: Read
  - Contents: Read
  - Issues: Write

Pull request review comments are posted through the Issues comments API because GitHub pull requests are issues internally.

## Local Development

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

The server listens on:

```text
http://localhost:3000
```

Health check:

```text
GET /health
```

GitHub webhook endpoint:

```text
POST /webhooks/github
```

## Build

```bash
npm run build
```

Start the compiled app:

```bash
npm start
```

## Railway Deployment

1. Create a Railway project from this repository.
2. Add the environment variables listed above.
3. Set the start command to:

```bash
npm start
```

4. Set the build command to:

```bash
npm run build
```

5. Update the GitHub App webhook URL to your Railway public URL:

```text
https://YOUR_RAILWAY_DOMAIN/webhooks/github
```

## Review Output Format

The LLM is prompted to return JSON in this shape:

```json
{
  "summary": "Overall assessment in 2-3 sentences",
  "issues": [
    {
      "file": "filename",
      "line": 42,
      "severity": "error | warning | suggestion",
      "comment": "Explanation of the issue"
    }
  ]
}
```

Reviewr Aii formats that response into a GitHub markdown comment with a summary and issues table.
