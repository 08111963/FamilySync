import { execFile } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// Directory frontend il cui ultimo commit fa fede per capire se la build
// statica in web-build/ è rimasta indietro (vedi memoria expo-static-web-build).
export const FRONTEND_DIRS = ["app", "components", "lib"] as const;

export type WebBuildStaleness = {
  /** stale = commit frontend più recente della build; fresh = ok; unknown = impossibile determinare */
  status: "stale" | "fresh" | "unknown";
  /** mtime (epoch secondi) di web-build/index.html, null se assente */
  webBuildMtime: number | null;
  /** timestamp (epoch secondi) dell'ultimo commit che tocca app/, components/, lib/; null se git non disponibile */
  lastFrontendCommit: number | null;
  /** messaggio leggibile, pensato per il log di avvio */
  message: string;
};

/**
 * Confronta la data della build statica web (web-build/index.html) con
 * l'ultimo commit che tocca le directory frontend. Non lancia mai: in caso
 * di dubbio (niente git, niente build) restituisce status "unknown".
 */
export async function checkWebBuildStaleness(
  rootDir: string = process.cwd(),
): Promise<WebBuildStaleness> {
  let webBuildMtime: number | null = null;
  try {
    const st = fs.statSync(path.join(rootDir, "web-build", "index.html"));
    webBuildMtime = Math.floor(st.mtimeMs / 1000);
  } catch {
    // nessuna build web presente
  }

  let lastFrontendCommit: number | null = null;
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["log", "-1", "--format=%ct", "--", ...FRONTEND_DIRS],
      { cwd: rootDir, timeout: 10_000 },
    );
    const parsed = parseInt(stdout.trim(), 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      lastFrontendCommit = parsed;
    }
  } catch {
    // git assente o repo non disponibile (es. ambiente di deploy)
  }

  if (webBuildMtime === null) {
    return {
      status: "unknown",
      webBuildMtime,
      lastFrontendCommit,
      message: "web-build/index.html assente: nessuna build statica da controllare",
    };
  }
  if (lastFrontendCommit === null) {
    return {
      status: "unknown",
      webBuildMtime,
      lastFrontendCommit,
      message: "git non disponibile: impossibile confrontare la build statica con i commit frontend",
    };
  }

  if (lastFrontendCommit > webBuildMtime) {
    const behindMin = Math.round((lastFrontendCommit - webBuildMtime) / 60);
    return {
      status: "stale",
      webBuildMtime,
      lastFrontendCommit,
      message:
        `web-build/ è STANTIA: l'ultimo commit frontend (app/, components/, lib/) è più recente ` +
        `della build statica di ~${behindMin} min. L'anteprima sulla porta 5000 mostra una versione ` +
        `vecchia dell'app: rigenerare l'export web (o ripubblicare).`,
    };
  }

  return {
    status: "fresh",
    webBuildMtime,
    lastFrontendCommit,
    message: "web-build/ è aggiornata rispetto all'ultimo commit frontend",
  };
}
