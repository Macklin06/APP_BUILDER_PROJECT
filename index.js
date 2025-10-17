import express from 'express';
import 'dotenv/config';
import dotenv from 'dotenv';
import path from 'path';

// Explicitly load .env (also handled by 'dotenv/config' import, but explicit call helps during debugging)
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { Octokit } from 'octokit';
import { Buffer } from 'buffer';

// --- Configuration ---
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SHARED_SECRET = process.env.SHARED_SECRET;
const GITHUB_PAT = process.env.GITHUB_PAT;
const GITHUB_USERNAME = process.env.GITHUB_USERNAME;
// OpenAI / AI Pipe configuration
const AI_PIPE_TOKEN = process.env.AI_PIPE_TOKEN; // legacy / convenience token
// Prefer explicit OPENAI_* env vars; fall back to AI Pipe compatibility if present
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || AI_PIPE_TOKEN || process.env.AI_PIPE_KEY || process.env.AI_PIPE_TOKEN;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || process.env.AI_PIPE_ENDPOINT || (AI_PIPE_TOKEN ? 'https://aipipe.org/openai/v1' : undefined);

// Safe debug: log presence (boolean) of the important env vars without exposing values
console.log('Env presence:', {
    SHARED_SECRET: !!process.env.SHARED_SECRET,
    GITHUB_PAT: !!process.env.GITHUB_PAT,
    GITHUB_USERNAME: !!process.env.GITHUB_USERNAME,
    AI_PIPE_TOKEN: !!process.env.AI_PIPE_TOKEN,
});

// Initialize Octokit for GitHub API interaction
const octokit = new Octokit({ auth: GITHUB_PAT });

// --- Helper Functions ---

/**
 * Generates a single-file HTML application using an LLM.
 * @param {string} brief - The description of the app to build.
 * @returns {Promise<string>} - The generated HTML content.
 */
async function generateAppWithLLM(brief) {
    console.log("Generating app content with LLM...");
    const systemPrompt = `You are an expert web developer specializing in creating single-file, self-contained HTML applications.
    You must use Tailwind CSS for styling, loaded from the official CDN. All HTML, CSS, and JavaScript must be included in a single index.html file.
    The application should be visually appealing, responsive, and fully functional based on the user's brief. Do not include any placeholder comments like "<!-- Your code here -->".
    Your response should be ONLY the HTML code, starting with <!DOCTYPE html> and nothing else.`;

    const userQuery = `Create an application based on this brief: "${brief}"`;
    // Determine final OpenAI-compatible endpoint and key
    const finalApiKey = OPENAI_API_KEY;
    const baseUrl = OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const apiUrl = `${baseUrl.replace(/\/$/, '')}/responses`;
    console.log(`Using LLM endpoint: ${apiUrl}`);

    try {
        if (!finalApiKey) throw new Error('Missing OpenAI/AI Pipe API key. Set OPENAI_API_KEY or AI_PIPE_TOKEN in your environment.');

        // Send a concatenated system+user input string to the Responses-style endpoint
        const combinedInput = `${systemPrompt}\n\n${userQuery}`;
        const body = {
            model: process.env.AI_MODEL || 'gpt-4o-mini',
            input: combinedInput,
            max_output_tokens: 2000
        };

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${finalApiKey}`
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            throw new Error(`OpenAI Responses API failed with status: ${response.status} ${errText}`);
        }

        const result = await response.json();

        // Try multiple common shapes returned by the Responses API / Chat-like endpoints
        let generatedText = null;

        if (typeof result.output_text === 'string' && result.output_text.trim()) {
            generatedText = result.output_text;
        }

        if (!generatedText && Array.isArray(result.output)) {
            for (const out of result.output) {
                if (!out || !Array.isArray(out.content)) continue;
                for (const c of out.content) {
                    // content items can have different shapes
                    if (typeof c.text === 'string' && c.text.trim()) {
                        generatedText = c.text;
                        break;
                    }
                    if (c.type === 'output_text' && typeof c.text === 'string' && c.text.trim()) {
                        generatedText = c.text;
                        break;
                    }
                    if (Array.isArray(c.parts) && c.parts.length) {
                        generatedText = c.parts.join('\n').trim();
                        if (generatedText) break;
                    }
                }
                if (generatedText) break;
            }
        }

        if (!generatedText && Array.isArray(result.candidates) && result.candidates.length) {
            const cand = result.candidates[0];
            generatedText = cand.output_text || cand.content?.[0]?.text || cand.content?.[0]?.parts?.join('\n');
        }

        if (!generatedText && Array.isArray(result.choices) && result.choices.length) {
            // fallback for chat/completions-like shape
            generatedText = result.choices[0].message?.content || result.choices[0].text;
        }

        if (!generatedText) {
            throw new Error('No content generated by the LLM. Response shape unexpected.');
        }

        console.log('LLM content generated successfully.');
        // Clean up potential markdown formatting from the LLM response
        return generatedText.replace(/```html/g, '').replace(/```/g, '').trim();

        } catch (error) {
                console.error('Error calling OpenAI Responses API:', error);
                // Fallback: return a working single-file calculator app using Tailwind CDN
                return `<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>Calculator</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
            /* small custom styles for the calculator */
            .calc-btn { @apply bg-gray-100 hover:bg-gray-200 rounded-lg text-lg p-4 m-1; }
        </style>
    </head>
    <body class="bg-gray-50 min-h-screen flex items-center justify-center">
        <div class="w-full max-w-md p-6">
            <div class="bg-white rounded-2xl shadow-lg p-6">
                <h1 class="text-2xl font-semibold mb-4 text-center">Calculator</h1>
                <div id="display" class="bg-gray-100 rounded-lg p-4 text-right text-3xl font-mono mb-4">0</div>
                <div class="grid grid-cols-4 gap-2">
                    <button class="calc-btn" data-action="digit">7</button>
                    <button class="calc-btn" data-action="digit">8</button>
                    <button class="calc-btn" data-action="digit">9</button>
                    <button class="calc-btn" data-action="op">/</button>

                    <button class="calc-btn" data-action="digit">4</button>
                    <button class="calc-btn" data-action="digit">5</button>
                    <button class="calc-btn" data-action="digit">6</button>
                    <button class="calc-btn" data-action="op">*</button>

                    <button class="calc-btn" data-action="digit">1</button>
                    <button class="calc-btn" data-action="digit">2</button>
                    <button class="calc-btn" data-action="digit">3</button>
                    <button class="calc-btn" data-action="op">-</button>

                    <button class="calc-btn" data-action="digit">0</button>
                    <button class="calc-btn" data-action="decimal">.</button>
                    <button class="calc-btn" data-action="equals">=</button>
                    <button class="calc-btn" data-action="op">+</button>
                </div>
                <div class="flex mt-4 justify-between">
                    <button id="clear" class="px-4 py-2 bg-red-100 rounded">Clear</button>
                    <button id="back" class="px-4 py-2 bg-yellow-100 rounded">Back</button>
                </div>
            </div>
        </div>

        <script>
            (function(){
                const display = document.getElementById('display');
                let current = '0';
                let previous = null;
                let operator = null;

                function refresh() { display.textContent = current; }

                function inputDigit(d) {
                    if (current === '0') current = d; else current += d;
                }

                function inputDecimal() {
                    if (!current.includes('.')) current += '.';
                }

                function clearAll() { current = '0'; previous = null; operator = null; }

                function backspace() { if (current.length > 1) current = current.slice(0,-1); else current = '0'; }

                function compute() {
                    if (operator == null || previous == null) return;
                    const a = parseFloat(previous);
                    const b = parseFloat(current);
                    let res = 0;
                    switch (operator) {
                        case '+': res = a + b; break;
                        case '-': res = a - b; break;
                        case '*': res = a * b; break;
                        case '/': res = b === 0 ? 'Error' : a / b; break;
                    }
                    current = String(res);
                    previous = null;
                    operator = null;
                }

                document.querySelectorAll('[data-action]').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const action = btn.getAttribute('data-action');
                        const txt = btn.textContent.trim();
                        if (action === 'digit') inputDigit(txt);
                        else if (action === 'decimal') inputDecimal();
                        else if (action === 'op') {
                            if (operator && previous != null) { compute(); }
                            operator = txt;
                            previous = current;
                            current = '0';
                        } else if (action === 'equals') { compute(); }
                        refresh();
                    });
                });

                document.getElementById('clear').addEventListener('click', () => { clearAll(); refresh(); });
                document.getElementById('back').addEventListener('click', () => { backspace(); refresh(); });

                refresh();
            })();
        </script>
    </body>
</html>`;
        }
}

/**
 * Creates a README.md file content.
 * @param {string} repoName - The name of the repository.
 * @param {string} brief - The app description.
 * @returns {string} - The formatted README content.
 */
function createReadmeContent(repoName, brief) {
    return `# ${repoName}

## Summary
This repository was auto-generated based on the following brief: "${brief}". It contains a single-page web application.

## Setup & Usage
1.  No setup is required.
2.  The application is hosted using GitHub Pages.
3.  You can visit the live application at: https://${GITHUB_USERNAME}.github.io/${repoName}/

## Code Explanation
The \`index.html\` file contains the complete application. It's a self-contained file with HTML for structure, Tailwind CSS for styling, and JavaScript for interactivity.

## License
This project is licensed under the MIT License. See the \`LICENSE\` file for details.
`;
}

/**
 * Returns the content for the MIT License.
 * @returns {string} - MIT License text.
 */
function getLicenseContent() {
    return `MIT License

Copyright (c) ${new Date().getFullYear()} ${GITHUB_USERNAME}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
}


/**
 * Pushes files to a new or existing GitHub repository.
 * @param {string} repoName - The name of the repository.
 * @param {object[]} files - Array of file objects { path, content }.
 * @param {boolean} isRevision - Whether this is an update to an existing repo.
 * @returns {Promise<object>} - An object with repo_url, commit_sha, and pages_url.
 */
async function pushToGitHub(repoName, files, isRevision = false) {
    console.log(`Starting GitHub process for repo: ${repoName}. Revision: ${isRevision}`);
    
    if (!isRevision) {
        console.log("Creating new repository...");
        try {
                await octokit.rest.repos.createForAuthenticatedUser({
                    name: repoName,
                    private: false,
                    auto_init: false,
                });
                console.log("Repository created.");
        } catch (err) {
                // If the repo already exists, continue and treat this as a create-once scenario
                const isAlreadyExists = err && (err.status === 422) && (
                    err.response?.data?.message?.includes('name already exists') ||
                    Array.isArray(err.response?.data?.errors) && err.response.data.errors.some(e => (e.message || '').includes('already exists') || e.field === 'name')
                );
                if (isAlreadyExists) {
                    console.warn(`Repository ${repoName} already exists for user ${GITHUB_USERNAME}; continuing as update.`);
                } else {
                    throw err;
                }
        }
    }

    let latestCommitSha;

    for (const file of files) {
        let existingFileSha = undefined;
    // We'll commit files to the 'main' branch for new repositories so Pages can serve the index.html
    const initialTargetBranch = 'main';

    // If this is not a revision, ensure a 'main' branch exists and point to the default branch tip
    if (!isRevision) {
            try {
                const repoInfo = await octokit.rest.repos.get({ owner: GITHUB_USERNAME, repo: repoName });
                const defaultBranch = repoInfo.data.default_branch;
                // If default branch isn't 'main', create a 'main' ref pointing to the default branch commit
                if (defaultBranch !== initialTargetBranch) {
                        try {
                            // Get the default branch ref
                            const defaultRef = await octokit.rest.git.getRef({ owner: GITHUB_USERNAME, repo: repoName, ref: `heads/${defaultBranch}` });
                            const sha = defaultRef.data.object.sha;
                            // Check if 'main' already exists
                            try {
                                await octokit.rest.git.getRef({ owner: GITHUB_USERNAME, repo: repoName, ref: `heads/${initialTargetBranch}` });
                                // 'main' exists, no-op
                            } catch (getRefErr) {
                                if (getRefErr && getRefErr.status === 404) {
                                    // Create 'main' ref pointing to the same commit as default branch
                                    await octokit.rest.git.createRef({ owner: GITHUB_USERNAME, repo: repoName, ref: `refs/heads/${initialTargetBranch}`, sha });
                                    console.log(`Created branch '${initialTargetBranch}' pointing to ${defaultBranch} commit ${sha}`);
                                } else {
                                    throw getRefErr;
                                }
                            }
                    } catch (innerErr) {
                        // If getting default ref fails (e.g., no commits yet), ignore and proceed — createOrUpdateFileContents can create the branch later
                        console.warn(`Could not create '${targetBranch}' branch automatically: ${innerErr.message}`);
                    }
                }
            } catch (repoErr) {
                console.warn(`Could not inspect repository ${repoName}: ${repoErr.message}`);
            }
        }

        if (isRevision) {
             try {
                const { data } = await octokit.rest.repos.getContent({
                    owner: GITHUB_USERNAME,
                    repo: repoName,
                    path: file.path,
                });
                existingFileSha = data.sha;
                console.log(`Found existing file ${file.path} with SHA ${existingFileSha}`);
            } catch (error) {
                if (error.status === 404) {
                    console.log(`File ${file.path} not found in repo, will create it.`);
                } else {
                    throw error; // Re-throw other errors
                }
            }
        }

        // Before creating/updating, try to fetch the existing file on the target branch to get its sha
        const createParams = {
            owner: GITHUB_USERNAME,
            repo: repoName,
            path: file.path,
            message: `${isRevision ? 'Revise' : 'Initial'} commit: ${file.path}`,
            content: Buffer.from(file.content).toString('base64'),
            // sha may be undefined and that's acceptable for creating new files
        };

    // target branch for non-revision runs
    const targetBranch = !isRevision ? initialTargetBranch : undefined;
    if (targetBranch) createParams.branch = targetBranch;

        // If we didn't already find existingFileSha and the branch is main, attempt to get content on that branch
        if (!existingFileSha && targetBranch) {
            try {
                const existing = await octokit.rest.repos.getContent({ owner: GITHUB_USERNAME, repo: repoName, path: file.path, ref: targetBranch });
                if (existing && existing.data && existing.data.sha) {
                    createParams.sha = existing.data.sha;
                }
            } catch (getErr) {
                // If 404, the file doesn't exist yet — that's fine; otherwise rethrow
                if (getErr && getErr.status && getErr.status !== 404) {
                    console.warn(`Could not check existing file ${file.path} on branch ${targetBranch}: ${getErr.message}`);
                }
            }
        } else if (existingFileSha) {
            createParams.sha = existingFileSha;
        }

        let data;
        try {
            const resp = await octokit.rest.repos.createOrUpdateFileContents(createParams);
            data = resp.data;
        } catch (createErr) {
            // Handle case where GitHub expects a sha to update an existing file
            const errMsg = createErr?.response?.data?.message || createErr.message || '';
            if ((createErr?.status === 422 || errMsg.includes("sha")) && !createParams.sha) {
                try {
                    // Attempt to get the existing file SHA from 'main' first, then default branch
                    const refToTry = createParams.branch || 'main';
                    let existing;
                    try {
                        existing = await octokit.rest.repos.getContent({ owner: GITHUB_USERNAME, repo: repoName, path: file.path, ref: refToTry });
                    } catch (e2) {
                        // fallback: try without ref (default branch)
                        existing = await octokit.rest.repos.getContent({ owner: GITHUB_USERNAME, repo: repoName, path: file.path });
                    }
                    if (existing && existing.data && existing.data.sha) {
                        createParams.sha = existing.data.sha;
                        console.log(`Retrying commit for ${file.path} with sha ${createParams.sha}`);
                        const retryResp = await octokit.rest.repos.createOrUpdateFileContents(createParams);
                        data = retryResp.data;
                    } else {
                        throw createErr; // rethrow original if no sha found
                    }
                } catch (retryErr) {
                    // still failing — propagate original error for visibility
                    throw createErr;
                }
            } else {
                throw createErr;
            }
        }
        latestCommitSha = data.commit.sha;
        console.log(`Committed file ${file.path} with commit SHA ${latestCommitSha}`);
    }

    if (!isRevision) {
        try {
            console.log("Enabling GitHub Pages...");
            await octokit.rest.repos.createPagesSite({
                owner: GITHUB_USERNAME,
                repo: repoName,
                source: { branch: 'main', path: '/' },
            });
            console.log("GitHub Pages enabled.");
        } catch (pgErr) {
            console.warn(`Could not enable GitHub Pages automatically: ${pgErr.message}`);
        }
    }
    
    // Give Pages a moment to build the URL
    await new Promise(resolve => setTimeout(resolve, 5000));

    return {
        repo_url: `https://github.com/${GITHUB_USERNAME}/${repoName}`,
        commit_sha: latestCommitSha,
        pages_url: `https://${GITHUB_USERNAME}.github.io/${repoName}/`,
    };
}


/**
 * Posts the results to the evaluation URL with exponential backoff.
 * @param {string} url - The evaluation URL.
 * @param {object} payload - The JSON payload to send.
 */
async function notifyEvaluator(url, payload) {
    console.log("Notifying evaluator with payload:", payload);
    let delay = 1000; // Start with 1 second
    for (let i = 0; i < 5; i++) { // Try up to 5 times
        try {
            // If the URL looks like a markdown link [url](url), extract the inner URL
            const mdLinkMatch = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/i.exec(url);
            let targetUrl = url;
            if (mdLinkMatch) {
                targetUrl = mdLinkMatch[2];
            }

            // If the URL is wrapped in angle brackets or contains whitespace, trim
            targetUrl = targetUrl.trim().replace(/^<|>$/g, '');

            // Validate the URL
            try {
                new URL(targetUrl);
            } catch (err) {
                throw new Error(`Failed to parse URL from ${url}`);
            }

            const response = await fetch(targetUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (response.ok) {
                console.log(`Evaluation POST successful with status: ${response.status}`);
                return;
            }
            console.warn(`Evaluation POST failed with status: ${response.status}. Retrying in ${delay / 1000}s...`);
        } catch (error) {
            console.warn(`Evaluation POST failed with error: ${error.message}. Retrying in ${delay / 1000}s...`);
        }
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Double the delay for the next retry
    }
    console.error("Failed to notify evaluator after multiple retries.");
}


// --- Main API Endpoint ---
app.post('/api-endpoint', async (req, res) => {
    const { secret, brief, task, email, round, nonce, evaluation_url } = req.body;

    // 1. Check the secret
    if (secret !== SHARED_SECRET) {
        return res.status(403).json({ error: 'Invalid secret' });
    }

    // 2. Send an immediate HTTP 200 response
    res.status(200).json({ message: 'Request received and is being processed.' });

    // 3. Process the request asynchronously after responding
    try {
        console.log(`Processing request for task: ${task}, round: ${round}`);
        const repoName = task; // Use the unique task as the repo name

        // 4. Generate app content with LLM
        const appContent = await generateAppWithLLM(brief);
        const readmeContent = createReadmeContent(repoName, brief);
        const licenseContent = getLicenseContent();

        // 5. Create file payloads
        const filesToCommit = [
            { path: 'index.html', content: appContent },
            { path: 'README.md', content: readmeContent },
            { path: 'LICENSE', content: licenseContent },
        ];
        
        // 6. Push to GitHub (create or update)
        const isRevision = (round === 2);
        const githubResult = await pushToGitHub(repoName, filesToCommit, isRevision);

        // 7. POST to the evaluation URL
        const evaluationPayload = {
            email,
            task,
            round,
            nonce,
            repo_url: githubResult.repo_url,
            commit_sha: githubResult.commit_sha,
            pages_url: githubResult.pages_url,
        };
        await notifyEvaluator(evaluation_url, evaluationPayload);

    } catch (error) {
        console.error(`[FATAL] An error occurred during async processing for task ${task}:`, error);
        // Here you might want to POST an error status to a monitoring service if you have one.
    }
});


// --- Server Startup ---
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    const missing = [];
    if (!SHARED_SECRET) missing.push('SHARED_SECRET');
    if (!GITHUB_PAT) missing.push('GITHUB_PAT');
    if (!GITHUB_USERNAME) missing.push('GITHUB_USERNAME');
    if (!AI_PIPE_TOKEN) missing.push('AI_PIPE_TOKEN');
    if (missing.length) {
        console.warn(`[WARNING] Missing environment variables: ${missing.join(', ')}. Please check your .env file.`);
    }
});
