import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = __dirname;

let cachedCandidates = null;

function pushCandidate(list, value) {
  if (!value) return;
  const trimmed = value.toString().trim();
  if (!trimmed) return;
  if (!list.includes(trimmed)) {
    list.push(trimmed);
  }
}

export function getPythonCandidates() {
  if (cachedCandidates) {
    return [...cachedCandidates];
  }
  const candidates = [];
  pushCandidate(candidates, process.env.CRM_PYTHON_BIN);
  pushCandidate(candidates, process.env.PYTHON_BIN);

  const venv = process.env.VIRTUAL_ENV;
  if (venv) {
    pushCandidate(candidates, path.join(venv, "bin", "python"));
    pushCandidate(candidates, path.join(venv, "bin", "python3"));
    pushCandidate(candidates, path.join(venv, "Scripts", "python.exe"));
    pushCandidate(candidates, path.join(venv, "Scripts", "python"));
  }

  pushCandidate(candidates, path.join(projectRoot, ".venv", "bin", "python"));
  pushCandidate(candidates, path.join(projectRoot, ".venv", "bin", "python3"));
  pushCandidate(candidates, path.join(projectRoot, ".venv", "Scripts", "python.exe"));
  pushCandidate(candidates, path.join(projectRoot, ".venv", "Scripts", "python"));

  pushCandidate(candidates, "python3");
  pushCandidate(candidates, "python");

  cachedCandidates = candidates;
  return [...cachedCandidates];
}

function isExecutable(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch (err) {
    if (err && err.code === "ENOENT") return false;
    return false;
  }
}

export function resolvePythonExecutable() {
  for (const candidate of getPythonCandidates()) {
    if (candidate.includes(path.sep) || candidate.includes("/")) {
      if (isExecutable(candidate)) {
        return candidate;
      }
    } else {
      return candidate;
    }
  }
  return "python3";
}

export function spawnPythonProcess(args = [], options = {}) {
  const candidates = getPythonCandidates();
  return new Promise((resolve, reject) => {
    const tryNext = () => {
      if (!candidates.length) {
        reject(new Error("Unable to locate a Python interpreter. Set CRM_PYTHON_BIN to the desired executable."));
        return;
      }
      const command = candidates.shift();
      let child;
      try {
        child = spawn(command, args, options);
      } catch (err) {
        if ((err?.code === "ENOENT" || err?.code === "EACCES") && candidates.length) {
          tryNext();
          return;
        }
        reject(err);
        return;
      }

      const onError = (err) => {
        child.removeListener("spawn", onSpawn);
        if ((err?.code === "ENOENT" || err?.code === "EACCES") && candidates.length) {
          tryNext();
        } else {
          reject(err);
        }
      };

      const onSpawn = () => {
        child.removeListener("error", onError);
        resolve({ child, command });
      };

      child.once("error", onError);
      child.once("spawn", onSpawn);
    };

    tryNext();
  });
}
