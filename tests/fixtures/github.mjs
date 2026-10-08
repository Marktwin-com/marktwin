// Deterministic GitHub transport: real browser/editor code, no external writes.
export function createGitHubFixture() {
  const initial = new Map([
    [".agents/AGENTS.md", "# Agent rules\n\nKeep private work in the browser.\n\n$E = mc^2$\n\n```mermaid\nflowchart LR\n  Draft --> Checkpoint\n```\n\n![private](/private-image-sentinel.png)\n![remote](https://example.com/private-image-sentinel.png)\n\n<div style=\"background-image:url(/private-image-sentinel.png)\">Safe text</div>\n<svg><image href=\"/private-image-sentinel.png\" /></svg>\n<video src=\"/private-image-sentinel.png\"></video>\n"],
    [".agents/board.canvas", JSON.stringify({ nodes: [{ id: "one", type: "text", x: 0, y: 0, width: 300, height: 160, text: "Canvas smoke test" }], edges: [] })],
    [".agents/sketch.excalidraw", JSON.stringify({ type: "excalidraw", version: 2, source: "marktwin", elements: [], appState: { viewBackgroundColor: "#ffffff" }, files: {} })],
    ["README.md", "# Outside the selected scope\n"],
  ]);
  const snapshots = new Map([["commit-1", initial]]);
  const trees = new Map([["tree-1", initial]]);
  const blobs = new Map();
  const branches = new Map([["main", "commit-1"]]);
  const requests = [];
  const commits = [];
  let counter = 1;
  let failPublication = false;
  function entries(snapshot, prefix = "", recursive = false) {
    const rows = new Map();
    for (const [path, content] of snapshot) {
      if (!path.startsWith(prefix)) continue;
      const relative = path.slice(prefix.length);
      if (!recursive && relative.includes("/")) {
        const folder = relative.split("/")[0];
        const sha = `folder:${[...trees].find(([, value]) => value === snapshot)?.[0]}:${prefix}${folder}/`;
        rows.set(folder, { path: folder, type: "tree", sha });
      } else {
        const sha = `blob-${Buffer.from(path + "\0" + content).toString("base64url")}`;
        blobs.set(sha, content);
        rows.set(relative, { path: relative, type: "blob", sha, size: Buffer.byteLength(content) });
      }
    }
    return [...rows.values()];
  }
  return {
    requests, commits, snapshots, branches,
    setFailPublication(value) { failPublication = value; },
    advanceRemote(content) {
      const sha = `remote-${++counter}`;
      const snapshot = new Map(snapshots.get(branches.get("main")));
      snapshot.set(".agents/AGENTS.md", content);
      snapshots.set(sha, snapshot); trees.set(`tree-${sha}`, snapshot); branches.set("main", sha);
    },
    async handle(request) {
      const url = new URL(request.url());
      if (url.origin !== "https://api.github.com") return false;
      const method = request.method();
      const path = decodeURIComponent(url.pathname);
      const body = request.postData() ? JSON.parse(request.postData()) : {};
      requests.push({ method, path, body });
      const respond = (body, status = 200) => request.respond({ status, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type, X-GitHub-Api-Version", "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS", "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (method === "OPTIONS") { await respond({}, 204); return true; }
      const base = "/repos/acme/rules";
      let result;
      let status = 200;
      if (path === "/user") result = { login: "acme" };
      else if (path === base) result = { name: "rules", full_name: "acme/rules", owner: { login: "acme" }, default_branch: "main", private: true };
      else if (path === `${base}/branches`) result = [...branches].map(([name, sha]) => ({ name, commit: { sha } }));
      else if (path.startsWith(`${base}/branches/`)) result = { name: path.split("/").at(-1), commit: { sha: branches.get(path.split("/").at(-1)) } };
      else if (path.startsWith(`${base}/git/ref/heads/`)) result = { object: { sha: branches.get(path.split("/heads/")[1]) } };
      else if (method === "GET" && path.startsWith(`${base}/git/commits/`)) {
        const snapshot = snapshots.get(path.split("/commits/")[1]);
        result = { tree: { sha: [...trees].find(([, value]) => value === snapshot)?.[0] } };
      } else if (method === "GET" && path.startsWith(`${base}/git/trees/`)) {
        const sha = path.split("/trees/")[1];
        const [, tree, prefix] = sha.startsWith("folder:") ? sha.split(":") : [null, sha, ""];
        result = { sha, truncated: false, tree: entries(trees.get(tree), prefix, url.searchParams.get("recursive") === "1") };
      } else if (method === "GET" && path.startsWith(`${base}/git/blobs/`)) result = { encoding: "base64", content: Buffer.from(blobs.get(path.split("/blobs/")[1]) || "").toString("base64") };
      else if (method === "GET" && path.startsWith(`${base}/contents/`)) {
        const file = path.split("/contents/")[1]; const snapshot = snapshots.get(branches.get(url.searchParams.get("ref") || "main"));
        result = snapshot?.has(file) ? { name: file.split("/").at(-1), path: file, sha: `contents-${counter}`, encoding: "base64", content: Buffer.from(snapshot.get(file)).toString("base64") } : { message: "Not Found" };
        if (!snapshot?.has(file)) status = 404;
      } else if (method === "POST" && path === `${base}/git/blobs`) { const sha = `upload-${++counter}`; blobs.set(sha, Buffer.from(body.content, body.encoding === "base64" ? "base64" : "utf8").toString()); result = { sha }; }
      else if (method === "POST" && path === `${base}/git/trees`) {
        const next = new Map(trees.get(body.base_tree));
        for (const change of body.tree) { if (change.sha === null) next.delete(change.path); else next.set(change.path, change.content ?? blobs.get(change.sha)); }
        const sha = `tree-${++counter}`; trees.set(sha, next); result = { sha };
      } else if (method === "POST" && path === `${base}/git/commits`) {
        const sha = `commit-${++counter}`; snapshots.set(sha, trees.get(body.tree)); commits.push({ sha, ...body }); result = { sha };
      } else if (method === "PATCH" && path.startsWith(`${base}/git/refs/heads/`)) {
        const branch = path.split("/heads/")[1];
        const commit = commits.find(commit => commit.sha === body.sha);
        if (failPublication) { result = { message: "Simulated GitHub outage" }; status = 503; }
        else if (commit.parents[0] !== branches.get(branch)) { result = { message: "Reference update failed" }; status = 422; }
        else { branches.set(branch, body.sha); result = { ref: `refs/heads/${branch}`, object: { sha: body.sha } }; }
      } else if (method === "POST" && path === `${base}/git/refs`) { branches.set(body.ref.replace("refs/heads/", ""), body.sha); result = { ref: body.ref }; }
      else if (method === "DELETE" && path.startsWith(`${base}/git/refs/heads/`)) { branches.delete(path.split("/heads/")[1]); result = {}; }
      else if (path === `${base}/commits`) result = [];
      else { result = { message: `Unhandled fixture request: ${method} ${path}` }; status = 500; }
      await respond(result, status); return true;
    },
  };
}
