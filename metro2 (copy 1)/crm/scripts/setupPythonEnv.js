import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { resolvePythonExecutable } from "../pythonEnv.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const requirementsPath = path.join(projectRoot, "requirements.txt");
const venvPath = path.join(projectRoot, ".venv");
const isWindows = process.platform === "win32";
const venvPython = path.join(
  venvPath,
  isWindows ? "Scripts" : "bin",
  isWindows ? "python.exe" : "python"
);
const pythonExecutable = resolvePythonExecutable();

function runCommand(command, args, { capture = false, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const stdio = capture ? ["inherit", "pipe", "pipe"] : "inherit";
    const child = spawn(command, args, {
      cwd: projectRoot,
      env,
      stdio,
    });

    let stdout = "";
    let stderr = "";

    if (capture) {
      child.stdout.on("data", (data) => {
        stdout += data.toString();
        process.stdout.write(data);
      });
      child.stderr.on("data", (data) => {
        stderr += data.toString();
        process.stderr.write(data);
      });
    }

    child.on("error", (err) => {
      reject(err);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ code, stdout, stderr });
      } else {
        const error = new Error(
          `Command failed (${code}): ${command} ${args.join(" ")}`
        );
        error.code = code;
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      }
    });
  });
}

async function ensureSystemPip() {
  try {
    await runCommand(pythonExecutable, ["-m", "pip", "--version"], {
      capture: true,
    });
  } catch (err) {
    console.warn("Python pip not found. Bootstrapping with ensurepip...");
    await runCommand(pythonExecutable, ["-m", "ensurepip", "--upgrade"], {
      capture: true,
    });
  }
}

async function installWithSystemPython() {
  console.warn(
    "Falling back to system Python for requirements installation (no virtualenv)."
  );
  await ensureSystemPip();
  await runCommand(
    pythonExecutable,
    ["-m", "pip", "install", "--user", "-r", requirementsPath],
    { capture: true }
  );
}

async function createVenv() {
  if (fs.existsSync(venvPython)) {
    return true;
  }
  try {
    console.log("Creating Python virtual environment at", venvPath);
    await runCommand(pythonExecutable, ["-m", "venv", venvPath], {
      capture: true,
    });
    return true;
  } catch (err) {
    const output = `${err.stderr ?? ""}${err.stdout ?? ""}`;
    if (output.includes("ensurepip")) {
      console.warn(
        "Python interpreter is missing ensurepip support (python3-venv)."
      );
      console.warn(
        "To use an isolated virtualenv, install the venv module for your Python version or set CRM_PYTHON_BIN."
      );
    } else {
      console.warn("Unable to create Python virtualenv:", err.message);
    }
    return false;
  }
}

async function installRequirements() {
  if (!fs.existsSync(requirementsPath)) {
    console.log("No requirements.txt found; skipping Python dependency install.");
    return;
  }

  const requirementsContent = fs.readFileSync(requirementsPath, "utf8").trim();
  if (!requirementsContent) {
    console.log("requirements.txt is empty; skipping Python dependency install.");
    return;
  }

  const hasVenv = await createVenv();
  if (hasVenv && fs.existsSync(venvPython)) {
    try {
      await runCommand(venvPython, ["-m", "pip", "install", "-r", requirementsPath], {
        capture: true,
      });
      return;
    } catch (err) {
      console.warn(
        "Installing dependencies inside the virtualenv failed. Falling back to system Python."
      );
      console.warn(err.message);
    }
  }

  await installWithSystemPython();
}

installRequirements().catch((err) => {
  console.error("Python setup failed:", err.message);
  process.exitCode = err.code || 1;
});
