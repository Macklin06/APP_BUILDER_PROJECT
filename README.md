# APP_BUILDER_PROJECT

Simple automated single-file web app generator.
This service accepts a POST request to `/api-endpoint` containing a brief and metadata, uses an LLM to generate a single-file `index.html` app, pushes the files to a GitHub repo (one repo per task), and enables GitHub Pages for the generated repo. If LLM generation fails it falls back to a built-in working single-file calculator.

## Quick summary
- API: POST /api-endpoint — immediately returns 200 and processes the task asynchronously.
- The service commits `index.html`, `README.md`, and `LICENSE` to a new or existing GitHub repo named after the `task` field in the request.
- GitHub Pages is enabled (attempted) on the `main` branch for the generated repo, so the generated app will be served at:
  https://<GITHUB_USERNAME>.github.io/<task>/

## Run locally
Prerequisites
- Node.js 18+ and npm
- A GitHub Personal Access Token (PAT) with repo permissions
- Optional: AI Pipe token or OpenAI key

1. Install dependencies
```bash
npm install
```

2. Create a `.env` file in the project root with the following values:
```
SHARED_SECRET="your-secret-value"
GITHUB_PAT="ghp_... (your token)"
GITHUB_USERNAME="YourGitHubUser"
# Use AI Pipe token or OpenAI key. AI Pipe is OpenAI-compatible:
AI_PIPE_TOKEN="eyJhbGciOi... (your AI Pipe token)"
# If using AI Pipe, you can set:
OPENAI_API_KEY="$AI_PIPE_TOKEN"
OPENAI_BASE_URL="https://aipipe.org/openai/v1"
# Optional: choose a model
AI_MODEL="gpt-4o-mini"
```

3. Start the server:
```bash
npm start
```
Server listens by default on port 3000.

## API: /api-endpoint
POST JSON body:
- secret (string): must equal `SHARED_SECRET` in `.env`
- brief (string): description of the web app to generate
- task (string): unique name used for the generated repo
- email, round, nonce, evaluation_url (optional) — used by the evaluation flow

Example request:
```bash
curl http://localhost:3000/api-endpoint \
  -H "Content-Type: application/json" \
  -d '{
    "secret": "24f2001048MAC",
    "brief": "Create a simple calculator with a clean, modern interface that can perform addition, subtraction, multiplication, and division.",
    "task": "captcha-solver-yourname-1234",
    "email": "student@example.com",
    "round": 1,
    "nonce": "ab12-cd34-ef56",
    "evaluation_url": "https://httpbin.org/post"
  }'
```
Response:
```json
{"message":"Request received and is being processed."}
```
After processing, the service will:
- Create/update GitHub repo: `https://github.com/<GITHUB_USERNAME>/<task>`
- Enable GitHub Pages and attempt to publish the site at:
  `https://<GITHUB_USERNAME>.github.io/<task>/`
- POST results to `evaluation_url` if provided

## AI Pipe / OpenAI configuration
This project supports AI Pipe tokens and OpenAI keys. AI Pipe provides an OpenAI-compatible proxy. To use AI Pipe:
- Get a token from https://aipipe.org/login
- Set env vars:
```
OPENAI_API_KEY="<your AI Pipe token>"
OPENAI_BASE_URL="https://aipipe.org/openai/v1"
```
Or set `AI_PIPE_TOKEN` and the app will try to map that to `OPENAI_API_KEY` and `OPENAI_BASE_URL`.

If using a real OpenAI API key, set:
```
OPENAI_API_KEY="sk-..."
# leave OPENAI_BASE_URL empty to use OpenAI's public endpoint
```

## Deployment (Render, recommended)
1. Push this repo to GitHub (create a public repo).
2. On Render.com, create a new Web Service -> connect to this repo.
3. Build command: `npm install`
4. Start command: `npm start`
5. Add environment variables in Render dashboard (same as `.env`).
6. After deployment, Render provides a permanent URL (e.g., `https://app-builder-project.onrender.com`) — use `<url>/api-endpoint` as the API URL for submission.

## Submission checklist for graders
- API URL (POST target): https://<your-deploy-url>/api-endpoint
- Secret: `24f2001048MAC`  (or whatever you set in `.env`)
- GitHub repo: https://github.com/<GITHUB_USERNAME>/APP_BUILDER_PROJECT
- Notes: Endpoint returns 200 immediately and processes asynchronously; generated app pages are published to GitHub Pages under each generated repo.

## Troubleshooting
- 401 from LLM provider: If you see "invalid_issuer", set `OPENAI_BASE_URL=https://aipipe.org/openai/v1` and `OPENAI_API_KEY` to your AI Pipe token.
- GitHub errors: ensure `GITHUB_PAT` has `repo` scope for repo creation and content updates.
- Pages 404: wait a minute after commit; Pages can take a short time to build. If still 404, check repo branch and that `index.html` exists on `main`.

## License
MIT
