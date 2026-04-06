const path = require("path");
const { spawn } = require("child_process");
const { powershellPath } = require("./powershell");

const workerScriptPath = path.join(__dirname, "..", "scripts", "audio-worker.ps1");

class AudioWorkerClient {
  constructor() {
    this.child = null;
    this.stderr = "";
    this.nextRequestId = 1;
    this.pendingRequests = new Map();
    this.startPromise = null;
  }

  async send(command, payload = {}) {
    await this.ensureStarted();

    return new Promise((resolve, reject) => {
      const id = this.nextRequestId++;
      const message = JSON.stringify({
        id,
        command,
        ...payload
      });

      this.pendingRequests.set(id, { resolve, reject });
      this.child.stdin.write(`${message}\n`, (error) => {
        if (error) {
          this.pendingRequests.delete(id);
          reject(error);
        }
      });
    });
  }

  async ensureStarted() {
    if (this.child) {
      return;
    }

    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = new Promise((resolve, reject) => {
      const child = spawn(
        powershellPath,
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          workerScriptPath
        ],
        {
          windowsHide: true,
          stdio: ["pipe", "pipe", "pipe"]
        }
      );

      let stdoutBuffer = "";
      let settled = false;

      const finalizeStartup = (error) => {
        if (settled) {
          return;
        }

        settled = true;
        this.startPromise = null;

        if (error) {
          reject(error);
          return;
        }

        this.child = child;
        resolve();
      };

      child.stdout.on("data", (chunk) => {
        stdoutBuffer += chunk.toString();
        let newlineIndex = stdoutBuffer.indexOf("\n");

        while (newlineIndex !== -1) {
          const line = stdoutBuffer.slice(0, newlineIndex).trim();
          stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);

          if (line) {
            try {
              const message = JSON.parse(line);
              this.handleMessage(message);

              if (!settled) {
                finalizeStartup();
              }
            } catch (error) {
              this.rejectAllPending(new Error(`Invalid PowerShell response: ${line}`));

              if (!settled) {
                finalizeStartup(new Error(`Invalid PowerShell response: ${line}`));
              }
            }
          }

          newlineIndex = stdoutBuffer.indexOf("\n");
        }
      });

      child.stderr.on("data", (chunk) => {
        this.stderr += chunk.toString();
      });

      child.on("error", (error) => {
        this.child = null;
        this.rejectAllPending(error);

        if (!settled) {
          finalizeStartup(error);
        }
      });

      child.on("close", (code) => {
        const detail = this.stderr.trim();
        this.child = null;
        this.stderr = "";
        this.rejectAllPending(
          new Error(detail || `Audio worker exited with code ${code}`)
        );

        if (!settled) {
          finalizeStartup(new Error(detail || `Audio worker exited with code ${code}`));
        }
      });

      child.stdin.on("error", (error) => {
        this.child = null;
        this.rejectAllPending(error);

        if (!settled) {
          finalizeStartup(error);
        }
      });

      child.stdin.write('{"id":0,"command":"get"}\n', (error) => {
        if (error) {
          finalizeStartup(error);
        }
      });
    });

    return this.startPromise;
  }

  handleMessage(message) {
    const pending = this.pendingRequests.get(message.id);

    if (!pending) {
      return;
    }

    this.pendingRequests.delete(message.id);

    if (message.ok) {
      pending.resolve(message.state);
      return;
    }

    pending.reject(new Error(message.error || "Audio worker request failed"));
  }

  rejectAllPending(error) {
    for (const { reject } of this.pendingRequests.values()) {
      reject(error);
    }

    this.pendingRequests.clear();
  }

  close() {
    if (!this.child) {
      return;
    }

    this.child.stdin.end();
  }
}

const audioWorker = new AudioWorkerClient();

function getVolumeState() {
  return audioWorker.send("get");
}

function setVolumeLevel(level) {
  return audioWorker.send("set-volume", { level: Number(level) });
}

function setMuteState(muted) {
  return audioWorker.send("set-mute", { muted: Boolean(muted) });
}

function closeAudioWorker() {
  audioWorker.close();
}

module.exports = {
  closeAudioWorker,
  getVolumeState,
  setMuteState,
  setVolumeLevel
};
