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
let displayedVolume = 0;
let volumeAnimationFrame = null;
let volumeAnimationToken = 0;
let pendingVolumeLevel = null;

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

function stopVolumeAnimation() {
  if (volumeAnimationFrame !== null) {
    window.cancelAnimationFrame(volumeAnimationFrame);
    volumeAnimationFrame = null;
  }
}

function animateDisplayedVolume(targetLevel) {
  const nextTarget = clampVolume(targetLevel);
  const distance = Math.abs(nextTarget - displayedVolume);

  if (distance < 0.5) {
    stopVolumeAnimation();
    applyDisplayedVolume(nextTarget);
    return;
  }

  const animationToken = ++volumeAnimationToken;
  const startLevel = displayedVolume;
  const startTime = Date.now();
  const duration = Math.min(420, Math.max(160, distance * 10));

  stopVolumeAnimation();

  function tick() {
    if (animationToken !== volumeAnimationToken || isDraggingSlider || isInteractionLocked()) {
      return;
    }

    const elapsed = Date.now() - startTime;
    const progress = Math.min(1, elapsed / duration);
    const easedProgress = 1 - Math.pow(1 - progress, 3);
    const nextLevel = startLevel + ((nextTarget - startLevel) * easedProgress);

    applyDisplayedVolume(nextLevel);

    if (progress < 1) {
      volumeAnimationFrame = window.requestAnimationFrame(tick);
      return;
    }

    volumeAnimationFrame = null;
    applyDisplayedVolume(nextTarget);
  }

  volumeAnimationFrame = window.requestAnimationFrame(tick);
}

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
    applyDisplayedVolume(state.volume);
  }

  muteButton.textContent = state.muted ? "Unmute" : "Mute";
  document.body.dataset.muted = String(state.muted);
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

    if (pendingVolumeLevel !== null) {
      if (state.volume === pendingVolumeLevel) {
        pendingVolumeLevel = null;
      } else if (!showStatus) {
        currentState = {
          ...currentState,
          muted: state.muted
        };
        muteButton.textContent = state.muted ? "Unmute" : "Mute";
        document.body.dataset.muted = String(state.muted);
        return;
      }
    }

    if (isDraggingSlider || isInteractionLocked()) {
      currentState = {
        ...currentState,
        muted: state.muted
      };
      muteButton.textContent = state.muted ? "Unmute" : "Mute";
      document.body.dataset.muted = String(state.muted);
      return;
    }

    if (!showStatus && state.volume !== displayedVolume) {
      currentState = state;
      muteButton.textContent = state.muted ? "Unmute" : "Mute";
      document.body.dataset.muted = String(state.muted);
      animateDisplayedVolume(state.volume);
    } else {
      renderState(state);
    }

    if (showStatus) {
      showMessage("");
    }
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function updateVolume(level) {
  const requestId = ++volumeRequestId;
  const normalizedLevel = clampVolume(level);
  pendingVolumeLevel = normalizedLevel;
  lockInteractions();

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

    if (requestId < latestAppliedRequestId) {
      return;
    }

    latestAppliedRequestId = requestId;
    if (state.volume === pendingVolumeLevel) {
      pendingVolumeLevel = null;
    }
    renderState(state);
    showMessage("");
  } catch (error) {
    pendingVolumeLevel = null;
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

function startSliderInteraction() {
  isDraggingSlider = true;
  volumeAnimationToken += 1;
  stopVolumeAnimation();
  lockInteractions();
}

function endSliderInteraction() {
  isDraggingSlider = false;
  lockInteractions();
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
  lockInteractions();
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
  lockInteractions();
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

  if (volumeUpdateTimer !== null) {
    window.clearTimeout(volumeUpdateTimer);
  }

  stopVolumeAnimation();
});
