#!/usr/bin/env node
// github-push.js — Push workspace files to GitHub via the Git Data API
// Usage: node scripts/github-push.js "optional commit message"
// Requires: GITHUB_TOKEN environment variable

import { readFileSync, statSync, readdirSync, existsSync } from "fs";
import { join, relative } from "path";

const TOKEN = process.env.GITHUB_TOKEN;
const OWNER = "JBlizzard-sketch";
const REPO = "whatsapp-order-management";
const BRANCH = "main";
const ROOT = new URL("..", import.meta.url).pathname;
const COMMIT_MSG = process.argv[2] || `chore: sync ${new Date().toISOString().slice(0, 19).replace("T", " ")} UTC`;

// Directories / files to exclude from push
const EXCLUDE = new Set([
  "node_modules", ".git", ".replit-artifact", "dist", "tmp", "out-tsc",
  ".expo", ".expo-shared", "pnpm-lock.yaml", ".env", ".local",
]);

const EXCLUDE_PATTERNS = [/\.tsbuildinfo$/, /\.DS_Store$/, /\.lock$/];

function shouldExclude(name) {
  if (EXCLUDE.has(name)) return true;
  return EXCLUDE_PATTERNS.some((p) => p.test(name));
}

function collectFiles(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (shouldExclude(entry.name)) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, files);
    } else {
      try {
        const stat = statSync(fullPath);
        // Skip files larger than 5MB
        if (stat.size < 5 * 1024 * 1024) {
          files.push(fullPath);
        }
      } catch {
        // skip unreadable
      }
    }
  }
  return files;
}

async function ghFetch(path, method = "GET", body) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `token ${TOKEN}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`GitHub API ${method} ${path} → ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function createBlob(content, encoding = "base64") {
  const data = await ghFetch(`/repos/${OWNER}/${REPO}/git/blobs`, "POST", { content, encoding });
  return data.sha;
}

async function run() {
  if (!TOKEN) throw new Error("GITHUB_TOKEN is not set");

  console.log(`📂 Collecting files from: ${ROOT}`);
  const allFiles = collectFiles(ROOT);
  console.log(`📄 Found ${allFiles.length} files to push`);

  // Get current HEAD to see if repo has any commits
  let baseTreeSha = null;
  let parentSha = null;
  try {
    const refData = await ghFetch(`/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`);
    parentSha = refData.object.sha;
    const commitData = await ghFetch(`/repos/${OWNER}/${REPO}/git/commits/${parentSha}`);
    baseTreeSha = commitData.tree.sha;
    console.log(`🔗 Base commit: ${parentSha.slice(0, 7)}`);
  } catch {
    console.log("🆕 No existing commits — creating initial commit");
  }

  // Create blobs for each file
  console.log("📤 Creating blobs...");
  const treeItems = [];
  let done = 0;
  for (const filePath of allFiles) {
    const relPath = relative(ROOT, filePath);
    try {
      const raw = readFileSync(filePath);
      const b64 = raw.toString("base64");
      const sha = await createBlob(b64, "base64");
      treeItems.push({ path: relPath, mode: "100644", type: "blob", sha });
      done++;
      if (done % 10 === 0) console.log(`  ${done}/${allFiles.length} blobs created...`);
    } catch (err) {
      console.warn(`  ⚠️  Skipped ${relPath}: ${err.message}`);
    }
  }
  console.log(`✅ Created ${treeItems.length} blobs`);

  // Create tree
  console.log("🌳 Creating tree...");
  const treeBody = { tree: treeItems };
  if (baseTreeSha) treeBody.base_tree = baseTreeSha;
  const treeData = await ghFetch(`/repos/${OWNER}/${REPO}/git/trees`, "POST", treeBody);
  console.log(`🌳 Tree SHA: ${treeData.sha.slice(0, 7)}`);

  // Create commit
  console.log("💾 Creating commit...");
  const commitBody = {
    message: COMMIT_MSG,
    tree: treeData.sha,
    author: { name: "JBlizzard-sketch", email: "jblizzard@whatsapp-orders.dev", date: new Date().toISOString() },
  };
  if (parentSha) commitBody.parents = [parentSha];
  const commitData = await ghFetch(`/repos/${OWNER}/${REPO}/git/commits`, "POST", commitBody);
  console.log(`💾 Commit SHA: ${commitData.sha.slice(0, 7)}`);

  // Update or create branch ref
  if (parentSha) {
    await ghFetch(`/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, "PATCH", {
      sha: commitData.sha,
      force: false,
    });
  } else {
    await ghFetch(`/repos/${OWNER}/${REPO}/git/refs`, "POST", {
      ref: `refs/heads/${BRANCH}`,
      sha: commitData.sha,
    });
  }

  console.log(`\n🚀 Pushed ${treeItems.length} files to GitHub!`);
  console.log(`🔗 https://github.com/${OWNER}/${REPO}`);
}

run().catch((err) => {
  console.error("❌ Push failed:", err.message);
  process.exit(1);
});
