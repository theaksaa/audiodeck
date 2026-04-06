const { spawn } = require("child_process");

const powershellPath =
  process.env.POWERSHELL_PATH ||
  "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";

function runPowerShell(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(powershellPath, args, {
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `PowerShell command failed with exit code ${code}`));
        return;
      }

      resolve(stdout.trim());
    });
  });
}

module.exports = {
  powershellPath,
  runPowerShell
};
