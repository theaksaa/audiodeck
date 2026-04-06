const volumeSlider = document.getElementById("volumeSlider");
const volumeValue = document.getElementById("volumeValue");
const muteButton = document.getElementById("muteButton");
const message = document.getElementById("message");

let currentState = {
  volume: 0,
  muted: false
};

let refreshTimer = null;
let isDraggingSlider = false;
let displayedVolume = 0;
let pendingVolumeLevel = null;
let latestVolumeIntent = null;
let latestSentVolumeRequestId = 0;
let latestAppliedVolumeRequestId = 0;
let volumeSendFrame = null;

function clampVolume(level) {
  return Math.max(0, Math.min(100, Number(level) || 0));
}

function setSliderVisual(level) {
  const percent = `${clampVolume(level)}%`;
  document.documentElement.style.setProperty("--slider-percent", percent);
}

function applyDisplayedVolume(level) {
  const nextLevel = clampVolume(level);
  displayedVolume = nextLevel;
  volumeSlider.value = String(nextLevel);
  setSliderVisual(nextLevel);
  volumeValue.textContent = `${Math.round(nextLevel)}%`;
}

function showMessage(text, isError = false) {
  message.textContent = text;
  message.dataset.state = isError ? "error" : "ok";
}

function hasPendingVolumeWork() {
  return pendingVolumeLevel !== null;
}

function renderMuteState(muted) {
  currentState = {
    ...currentState,
    muted
  };
  muteButton.textContent = muted ? "Unmute" : "Mute";
  document.body.dataset.muted = String(muted);
}

function renderState(state) {
  currentState = state;

  if (!isDraggingSlider) {
    applyDisplayedVolume(state.volume);
  }

  muteButton.textContent = state.muted ? "Unmute" : "Mute";
  document.body.dataset.muted = String(state.muted);
}

async function loadState(showStatus = false) {
  if (!showStatus && (isDraggingSlider || hasPendingVolumeWork())) {
    return;
  }

  try {
    const response = await fetch("/api/volume", { cache: "no-store" });
    const state = await response.json();

    if (!response.ok) {
      throw new Error(state.error || "Failed to read volume state");
    }

    if (state.volume === currentState.volume && state.muted === currentState.muted && !showStatus) {
      return;
    }

    if (hasPendingVolumeWork()) {
      if (pendingVolumeLevel !== null && state.volume === pendingVolumeLevel) {
        pendingVolumeLevel = null;
      } else if (!showStatus) {
        renderMuteState(state.muted);
        return;
      }
    }

    if (isDraggingSlider) {
      renderMuteState(state.muted);
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
  const normalizedLevel = clampVolume(level);
  const requestId = ++latestSentVolumeRequestId;

  try {
    const response = await fetch("/api/volume", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ level: normalizedLevel })
    });
    const state = await response.json();

    if (!response.ok) {
      throw new Error(state.error || "Failed to update volume");
    }

    if (requestId < latestAppliedVolumeRequestId) {
      return;
    }

    latestAppliedVolumeRequestId = requestId;

    if (pendingVolumeLevel !== null && state.volume === pendingVolumeLevel) {
      pendingVolumeLevel = null;
    }

    if (latestVolumeIntent !== null && state.volume !== latestVolumeIntent) {
      renderMuteState(state.muted);
      showMessage("");
      return;
    }

    latestVolumeIntent = null;
    renderState(state);
    showMessage("");
  } catch (error) {
    if (requestId === latestSentVolumeRequestId) {
      pendingVolumeLevel = null;
      latestVolumeIntent = null;
    }
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
  const normalizedLevel = clampVolume(level);
  latestVolumeIntent = normalizedLevel;
  pendingVolumeLevel = normalizedLevel;

  if (volumeSendFrame !== null) {
    return;
  }

  volumeSendFrame = window.requestAnimationFrame(() => {
    volumeSendFrame = null;
    updateVolume(latestVolumeIntent);
  });
}

function startSliderInteraction() {
  isDraggingSlider = true;
}

function endSliderInteraction() {
  isDraggingSlider = false;

  if (pendingVolumeLevel !== null) {
    applyDisplayedVolume(pendingVolumeLevel);
  }
}

volumeSlider.addEventListener("pointerdown", startSliderInteraction);
volumeSlider.addEventListener("pointerup", endSliderInteraction);
volumeSlider.addEventListener("pointercancel", endSliderInteraction);
volumeSlider.addEventListener("mousedown", startSliderInteraction);
volumeSlider.addEventListener("touchstart", startSliderInteraction, { passive: true });
window.addEventListener("mouseup", endSliderInteraction);
window.addEventListener("touchend", endSliderInteraction, { passive: true });
window.addEventListener("touchcancel", endSliderInteraction, { passive: true });

volumeSlider.addEventListener("input", () => {
  const level = clampVolume(volumeSlider.value);
  applyDisplayedVolume(level);
  pendingVolumeLevel = level;
  currentState = {
    ...currentState,
    volume: level
  };
  queueVolumeUpdate(level);
});

volumeSlider.addEventListener("change", () => {
  isDraggingSlider = false;
});

muteButton.addEventListener("click", () => {
  updateMute(!currentState.muted);
});

window.addEventListener("load", () => {
  applyDisplayedVolume(0);
  loadState(true);
  refreshTimer = window.setInterval(() => loadState(false), 500);
});

window.addEventListener("beforeunload", () => {
  if (refreshTimer !== null) {
    window.clearInterval(refreshTimer);
  }

  if (volumeSendFrame !== null) {
    window.cancelAnimationFrame(volumeSendFrame);
  }
});
