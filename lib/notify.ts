"use client";

/** Two-tone chime for the customer's "order ready" alert. */
export function playReadyChime() {
    playTones([880, 1320], 0.18);
}

/** Three-tone chime for the kitchen's "new order" alert -- distinct
 * from the customer chime so staff can tell them apart by ear. */
export function playNewOrderChime() {
    playTones([660, 880, 1100], 0.15);
}

function playTones(frequencies: number[], noteDuration: number) {
    try {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          const ctx = new AudioCtx();
          frequencies.forEach((freq, i) => {
                  const osc = ctx.createOscillator();
                  const gain = ctx.createGain();
                  osc.type = "sine";
                  osc.frequency.value = freq;
                  gain.gain.setValueAtTime(0.2, ctx.currentTime + i * noteDuration);
                  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (i + 1) * noteDuration);
                  osc.connect(gain);
                  gain.connect(ctx.destination);
                  osc.start(ctx.currentTime + i * noteDuration);
                  osc.stop(ctx.currentTime + (i + 1) * noteDuration);
          });
    } catch {
          // Web Audio unavailable -- silently skip, visual banner still fires.
    }
}

export function vibrate(pattern: number | number[] = 200) {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          try {
                  navigator.vibrate(pattern);
          } catch {
                  // ignore
          }
    }
}

/** Flashes the document title until the tab regains focus. */
export function flashTabTitle(message: string) {
    if (typeof document === "undefined") return;
    const original = document.title;
    let flashed = false;
    const interval = setInterval(() => {
          document.title = flashed ? original : message;
          flashed = !flashed;
    }, 1000);

  const stop = () => {
        clearInterval(interval);
        document.title = original;
        document.removeEventListener("visibilitychange", onVisible);
  };
    const onVisible = () => {
          if (!document.hidden) stop();
    };
    document.addEventListener("visibilitychange", onVisible);
    // Safety net in case the tab is never refocused.
  setTimeout(stop, 5 * 60 * 1000);
}
