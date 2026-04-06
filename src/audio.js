const path = require("path");
const { spawn } = require("child_process");

const scriptPath = path.join(__dirname, "..", "scripts", "audio-control.ps1");
const powershellPath =
  process.env.POWERSHELL_PATH ||
  "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";

function runAudioCommand(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      powershellPath,
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
        ...args
      ],
      {
        windowsHide: true
      }
    );

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
        const message = stderr.trim() || `PowerShell command failed with exit code ${code}`;
        reject(new Error(message));
        return;
      }

      try {
        resolve(JSON.parse(stdout.trim()));
      } catch (error) {
        reject(new Error(`Invalid PowerShell response: ${stdout.trim()}`));
      }
    });
  });
}

function getVolumeState() {
  return runAudioCommand(["get"]);
}

function setVolumeLevel(level) {
  return runAudioCommand(["set-volume", String(level)]);
}

function setMuteState(muted) {
  return runAudioCommand(["set-mute", muted ? "true" : "false"]);
}

module.exports = {
  getVolumeState,
  setMuteState,
  setVolumeLevel
};
