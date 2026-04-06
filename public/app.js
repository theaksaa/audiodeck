const volumeSlider = document.getElementById("volumeSlider");
const volumeValue = document.getElementById("volumeValue");
const muteButton = document.getElementById("muteButton");
const message = document.getElementById("message");

let currentState = {
  volume: 0,
  muted: false
};

let refreshTimer = null;
let volumeUpdateTimer = null;
let volumeRequestId = 0;
let latestAppliedRequestId = 0;
let isDraggingSlider = false;
let interactionLockUntil = 0;

function lockInteractions(duration = 700) {
  interactionLockUntil = Date.now() + duration;
}

function isInteractionLocked() {
  return Date.now() < interactionLockUntil;
}

function showMessage(text, isError = false) {
  message.textContent = text;
  message.dataset.state = isError ? "error" : "ok";
}

function renderState(state) {
  currentState = state;

  if (!isDraggingSlider && !isInteractionLocked()) {
    volumeSlider.value = String(state.volume);
  }

  volumeValue.textContent = `${state.volume}%`;
  muteButton.textContent = state.muted ? "Unmute" : "Mute";
}

async function loadState(showStatus = false) {
  try {
    const response = await fetch("/api/volume", { cache: "no-store" });
    const state = await response.json();

    if (!response.ok) {
      throw new Error(state.error || "Failed to read volume state");
    }

    if (state.volume === currentState.volume && state.muted === currentState.muted && !showStatus) {
      return;
    }

    if (isDraggingSlider || isInteractionLocked()) {
      currentState = {
        ...currentState,
        muted: state.muted
      };
      muteButton.textContent = state.muted ? "Unmute" : "Mute";
      return;
    }

    renderState(state);

    if (showStatus) {
      showMessage("");
    }
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function updateVolume(level) {
  const requestId = ++volumeRequestId;
  lockInteractions();

  try {
    const response = await fetch("/api/volume", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ level })
    });
    const state = await response.json();

    if (!response.ok) {
      throw new Error(state.error || "Failed to update volume");
    }

    if (requestId < latestAppliedRequestId) {
      return;
    }

    latestAppliedRequestId = requestId;
    renderState(state);
    showMessage("");
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function updateMute(muted) {
  try {
    const response = await fetch("/api/mute", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ muted })
    });
    const state = await response.json();

    if (!response.ok) {
      throw new Error(state.error || "Failed to update mute");
    }

    renderState(state);
    showMessage("");
  } catch (error) {
    showMessage(error.message, true);
  }
}

function queueVolumeUpdate(level) {
  if (volumeUpdateTimer !== null) {
    window.clearTimeout(volumeUpdateTimer);
  }

  volumeUpdateTimer = window.setTimeout(() => {
    volumeUpdateTimer = null;
    updateVolume(level);
  }, 90);
}

volumeSlider.addEventListener("pointerdown", () => {
  isDraggingSlider = true;
  lockInteractions();
});

volumeSlider.addEventListener("pointerup", () => {
  isDraggingSlider = false;
  lockInteractions();
});

volumeSlider.addEventListener("pointercancel", () => {
  isDraggingSlider = false;
  lockInteractions();
});

volumeSlider.addEventListener("input", () => {
  const level = Number(volumeSlider.value);
  lockInteractions();
  volumeValue.textContent = `${level}%`;
  currentState = {
    ...currentState,
    volume: level
  };
  queueVolumeUpdate(level);
});

volumeSlider.addEventListener("change", () => {
  isDraggingSlider = false;
  lockInteractions();
});

muteButton.addEventListener("click", () => {
  updateMute(!currentState.muted);
});

window.addEventListener("load", () => {
  loadState(true);
  refreshTimer = window.setInterval(() => loadState(false), 500);
});

window.addEventListener("beforeunload", () => {
  if (refreshTimer !== null) {
    window.clearInterval(refreshTimer);
  }

  if (volumeUpdateTimer !== null) {
    window.clearTimeout(volumeUpdateTimer);
  }
});
