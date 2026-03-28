import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import https from "node:https";

function parseArgs(argv) {
  const args = { tag: "", ci: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--tag") args.tag = argv[++i] || "";
    else if (arg === "--ci") args.ci = true;
  }
  return args;
}

function run(command, args, { allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8"
  });
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr || result.stdout}`.trim());
  }
  return result;
}

function git(args, opts) {
  return run("git", args, opts);
}

function readPackageVersion() {
  const raw = readFileSync("package.json", "utf8");
  const pkg = JSON.parse(raw);
  if (!pkg?.version || typeof pkg.version !== "string") {
    throw new Error("package.json version missing");
  }
  return pkg.version.trim();
}

function getTag(args) {
  const candidate = args.tag || process.env.GITHUB_REF_NAME || "";
  return String(candidate).trim();
}

function expectedTags(version) {
  return new Set([version, `v${version}`]);
}

function readReleaseManifest() {
  try {
    const raw = readFileSync("src/sot/release-manifest.json", "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("src/sot/release-manifest.json must be an object");
    }
    const releaseTag = String(parsed.releaseTag || "").trim();
    const packageVersion = String(parsed.packageVersion || "").trim();
    if (!releaseTag || !packageVersion) {
      throw new Error("src/sot/release-manifest.json requires releaseTag and packageVersion");
    }
    return { releaseTag, packageVersion };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function tagCommitSha(tag) {
  const local = git(["rev-parse", `${tag}^{commit}`], { allowFailure: true });
  if (local.status === 0) {
    return String(local.stdout || "").trim();
  }

  const remote = git(["ls-remote", "--tags", "origin", tag], { allowFailure: true });
  if (remote.status !== 0) {
    throw new Error(`cannot resolve local or remote tag ${tag}`);
  }
  const line = String(remote.stdout || "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .find(Boolean);
  if (!line) {
    throw new Error(`tag ${tag} not found on origin`);
  }
  const [sha] = line.split(/\s+/);
  return (sha || "").trim();
}

function tagObjectType(tag) {
  return String(git(["cat-file", "-t", `refs/tags/${tag}`]).stdout || "").trim();
}

function tagObjectSha(tag) {
  return String(git(["rev-parse", `refs/tags/${tag}`]).stdout || "").trim();
}

function ensureCommitOnMain(sha) {
  const checkRemote = git(["merge-base", "--is-ancestor", sha, "origin/main"], { allowFailure: true });
  if (checkRemote.status === 0) return;
  const checkLocal = git(["merge-base", "--is-ancestor", sha, "main"], { allowFailure: true });
  if (checkLocal.status !== 0) {
    throw new Error(`tag commit ${sha} is not on main`);
  }
}

function githubApi(pathname) {
  return new Promise((resolve, reject) => {
    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPOSITORY;
    if (!token || !repo) {
      reject(new Error("GITHUB_TOKEN and GITHUB_REPOSITORY are required in --ci mode"));
      return;
    }

    const req = https.request(
      {
        host: "api.github.com",
        path: pathname,
        method: "GET",
        headers: {
          "User-Agent": "seedworld-release-guard",
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28"
        }
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => {
          if ((res.statusCode || 500) >= 400) {
            reject(new Error(`GitHub API ${pathname} failed (${res.statusCode}): ${body}`));
            return;
          }
          try {
            resolve(JSON.parse(body || "{}"));
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    req.on("error", reject);
    req.end();
  });
}

async function ensureVerifiedOnGitHub(commitSha, tag, type) {
  const repo = process.env.GITHUB_REPOSITORY;
  const commit = await githubApi(`/repos/${repo}/commits/${commitSha}`);
  if (!commit?.commit?.verification?.verified) {
    throw new Error(`commit ${commitSha} is not GitHub-verified`);
  }

  if (type === "tag") {
    const tagSha = tagObjectSha(tag);
    const tagObj = await githubApi(`/repos/${repo}/git/tags/${tagSha}`);
    if (!tagObj?.verification?.verified) {
      throw new Error(`annotated tag ${tag} is not GitHub-verified`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const version = readPackageVersion();
  const manifest = readReleaseManifest();
  const tag = getTag(args);
  if (!tag) {
    throw new Error("tag missing: pass --tag or set GITHUB_REF_NAME");
  }

  if (manifest) {
    if (manifest.packageVersion !== version) {
      throw new Error(
        `release manifest packageVersion ${manifest.packageVersion} does not match package.json ${version}`
      );
    }
    if (tag !== manifest.releaseTag) {
      throw new Error(`tag ${tag} does not match src/sot/release-manifest.json releaseTag ${manifest.releaseTag}`);
    }
  } else {
    const allowed = expectedTags(version);
    if (!allowed.has(tag)) {
      throw new Error(`tag ${tag} does not match package version ${version}`);
    }
  }

  const commitSha = tagCommitSha(tag);
  if (!commitSha) {
    throw new Error(`cannot resolve commit for tag ${tag}`);
  }
  ensureCommitOnMain(commitSha);

  if (args.ci) {
    await ensureVerifiedOnGitHub(commitSha, tag, tagObjectType(tag));
  }

  console.log(`[RELEASE_GUARD] OK tag=${tag} version=${version} commit=${commitSha.slice(0, 12)}`);
}

await main();
