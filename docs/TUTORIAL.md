# Marktwin GitHub Setup Tutorial

This tutorial will guide you step-by-step on how to create a secure GitHub Personal Access Token (PAT) and link your repository to Marktwin so you can start collaborating.

---

## 1️⃣ What Permissions Do You Need?

Marktwin requires access to **read** your repository's files and **write** (commit) changes back to it.

Since Marktwin focuses on privacy, your token is **never** sent to our backend servers. It stays entirely within your browser's memory and is used to talk directly to the GitHub API.

Depending on the type of token you create, you will need:
- **Fine-grained Personal Access Token (Recommended):** `Contents` (Read and Write) access to your specific repository.
- **Classic Personal Access Token:** The full `repo` scope (which grants read/write to all your private and public repos).

If you want Marktwin to create a missing private repository, a fine-grained
token also needs **Administration: Read and write**. Repository creation with a
classic token requires the `repo` scope. You can instead create the repository
yourself and give Marktwin only Contents access.

---

## 2️⃣ Step-by-Step: Creating Your Token

We highly recommend using a **Fine-grained Personal Access Token** because it limits access to only the specific repositories you choose, adding an extra layer of security.

### Option A: Fine-Grained Token (Recommended)
1. Go to your GitHub account settings: **Settings > Developer settings > Personal access tokens > [Fine-grained tokens](https://github.com/settings/tokens?type=beta)**.
2. Click the **"Generate new token"** button.
3. Name your token (e.g., `Marktwin App`) and set an expiration date (e.g., 30 or 90 days).
4. Under **Repository access**, select **"Only select repositories"** and choose the repository you want to use with Marktwin.
5. Under **Permissions > Repository permissions**, find **"Contents"** and change the access to **"Read and write"**.
6. Click **Generate token** at the bottom of the page.
7. **Copy your token immediately!** (It starts with `github_pat_`). You will not be able to see it again.

### Option B: Classic Token (Legacy)
1. Go to **Settings > Developer settings > Personal access tokens > [Tokens (classic)](https://github.com/settings/tokens)**.
2. Click **"Generate new token (classic)"**.
3. Add a note (e.g., `Marktwin App`).
4. Check the box next to **`repo`** (Full control of private repositories).
5. Click **Generate token** and copy it (starts with `ghp_`).

---

## 3. Connect a Cabinet

Open Marktwin and choose **New Cabinet**. Enter `owner/repository`, then open the
saved Cabinet and enter your GitHub token. The token stays in session storage.
Select a branch and scopes in the configuration dialog. `.agents` is preferred
when present; **Main path** includes the repository and descendant folders.
Markdown/text, Canvas, and Drawing are available alongside configured assets.

For a missing repository, the app can create a private repository under the
GitHub user authenticated by your token. Creation requires Administration write
in addition to Contents write. Review the request before creating it.

## 4. Edit and checkpoint

Create or open a file and edit it. Use search, quick capture, artifact links,
decisions, Canvas, and drawings to organize the work. The GitHub icon shows staged
changes. Click it to review the changes, enter a message, and **Checkpoint**.
Automatic sync is off by default and can be enabled in Cabinet settings.

Checkpoint checks for remote changes. Non-overlapping changes can merge;
conflicts open a resolver rather than overwriting remote work. Failed publication
keeps your local draft. Recovery copies are stored in IndexedDB by default and
can be disabled or removed in Cabinet settings.

## 5. Collaborate and print

Use **More Cabinet actions → Start sharing session** for separate edit and view
links. Share only the intended link. View peers can read and chat; edit peers can
change the workspace; only the owner publishes to GitHub. Rotate links or stop
the session when needed. All participants should use matching app versions.

For Markdown, **More Cabinet actions → Print / Save as PDF** opens a sanitized
browser print view. Private content is never uploaded to a PDF service.
