import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";
import { checkWebBuildStaleness } from "../lib/web-build-staleness";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "webbuild-stale-"));
}

function initGitRepo(dir: string) {
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: "t",
    GIT_AUTHOR_EMAIL: "t@t",
    GIT_COMMITTER_NAME: "t",
    GIT_COMMITTER_EMAIL: "t@t",
  };
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: dir, env });
  git("init", "-q");
  return git;
}

test("unknown quando manca web-build/index.html", async () => {
  const dir = makeTmpDir();
  const result = await checkWebBuildStaleness(dir);
  assert.equal(result.status, "unknown");
  assert.equal(result.webBuildMtime, null);
});

test("unknown quando git non è disponibile (nessun repo)", async () => {
  const dir = makeTmpDir();
  fs.mkdirSync(path.join(dir, "web-build"));
  fs.writeFileSync(path.join(dir, "web-build", "index.html"), "<html></html>");
  const result = await checkWebBuildStaleness(dir);
  assert.equal(result.status, "unknown");
  assert.ok(result.webBuildMtime !== null);
  assert.equal(result.lastFrontendCommit, null);
});

test("stale quando il commit frontend è più recente della build", async () => {
  const dir = makeTmpDir();
  const git = initGitRepo(dir);

  // build web "vecchia"
  fs.mkdirSync(path.join(dir, "web-build"));
  const indexPath = path.join(dir, "web-build", "index.html");
  fs.writeFileSync(indexPath, "<html></html>");
  const old = new Date(Date.now() - 60 * 60 * 1000); // 1h fa
  fs.utimesSync(indexPath, old, old);

  // commit frontend "nuovo"
  fs.mkdirSync(path.join(dir, "app"));
  fs.writeFileSync(path.join(dir, "app", "index.tsx"), "export {}");
  git("add", "app");
  git("commit", "-q", "-m", "frontend change");

  const result = await checkWebBuildStaleness(dir);
  assert.equal(result.status, "stale");
  assert.match(result.message, /STANTIA/);
});

test("fresh quando la build è più recente dell'ultimo commit frontend", async () => {
  const dir = makeTmpDir();
  const git = initGitRepo(dir);

  fs.mkdirSync(path.join(dir, "components"));
  fs.writeFileSync(path.join(dir, "components", "A.tsx"), "export {}");
  git("add", "components");
  git("commit", "-q", "-m", "frontend change");

  // build generata DOPO il commit
  fs.mkdirSync(path.join(dir, "web-build"));
  fs.writeFileSync(path.join(dir, "web-build", "index.html"), "<html></html>");

  const result = await checkWebBuildStaleness(dir);
  assert.equal(result.status, "fresh");
});

test("unknown quando nessun commit tocca le directory frontend", async () => {
  const dir = makeTmpDir();
  const git = initGitRepo(dir);

  fs.writeFileSync(path.join(dir, "README.md"), "x");
  git("add", "README.md");
  git("commit", "-q", "-m", "non-frontend");

  fs.mkdirSync(path.join(dir, "web-build"));
  fs.writeFileSync(path.join(dir, "web-build", "index.html"), "<html></html>");

  const result = await checkWebBuildStaleness(dir);
  assert.equal(result.status, "unknown");
  assert.equal(result.lastFrontendCommit, null);
});
