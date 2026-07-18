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

## 3️⃣ Linking Your Repo in Marktwin

Now that you have your token, you can load your workspace into Marktwin. There
is no Marktwin account — the app opens directly to **Agent workspaces**.

1. Click **Connect repository**.
2. In the **Repository** field, enter your repo in the `owner/repo` format (for example, if your GitHub username is `nathalia` and your repo is `my-notes`, you would type `nathalia/my-notes`).
3. In the **Default branch** field, enter the branch you want to read/write from (usually `main`).
4. Click **Continue**.
5. Use **Continue with GitHub** when OAuth is configured, or expand the advanced
   personal-access-token option, paste your PAT, and click **Validate and open**.

Marktwin validates the repository and branch directly with GitHub before
opening it. If the repository is missing or inaccessible, you can cancel or
create a private repository under the authenticated personal account. A created
repository is initialized with `.agents/README.md`.

Only Markdown (`.md`) is managed in the workspace. On first open, Marktwin selects
`.agents` only. Use **Folders** to add **Main path** for root-level files such as
`README.md`, or another top-level folder; selecting one includes its Markdown
subfolders. Folder choices are remembered locally per workspace.

Changes are local and peer-to-peer until the owner opens **Changes**, inspects
the staged paths and content, optionally undoes/discards work, supplies a commit
message, and confirms **Sync**. Marktwin then publishes additions, edits, moves,
renames, deletions, and captured decisions together in one Git commit. If the
GitHub branch advanced, the commit is preserved on a new `*-marktwin-*` branch
and the workspace switches to it.

Use **Start sharing session** for fresh edit and view-only links. Both roles can
join Discussion; only edit peers can change Markdown, and only the owner can
publish. **Capture decision** turns an ephemeral discussion message into a
staged Markdown entry. Stop the session when finished or rotate links to revoke
the previous pair.

---

## 4️⃣ About Your Saved Setup

The repository name and branch you entered are saved in this browser's
`localStorage`, so you don't have to retype them next time.

*(Note: For your security, Marktwin will **never** save your token. It's kept in
this browser tab's session storage only — you'll need to paste it again in a
fresh tab.)*
