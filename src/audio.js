const path = require("path");
const { runPowerShell } = require("./powershell");

const scriptPath = path.join(__dirname, "..", "scripts", "audio-control.ps1");

function runAudioCommand(args) {
  return runPowerShell([
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptPath,
    ...args
  ]).then((output) => {
    try {
      return JSON.parse(output);
    } catch (error) {
      throw new Error(`Invalid PowerShell response: ${output}`);
    }
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
