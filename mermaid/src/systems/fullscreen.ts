// In-browser play: go fullscreen on a user gesture (Android Chrome etc.).
// When launched from the home-screen icon the manifest already gives us
// fullscreen and this is a no-op; iOS Safari has no fullscreen API at all —
// there, Add to Home Screen is the fullscreen path.
export function tryFullscreen() {
  const standalone =
    matchMedia('(display-mode: standalone)').matches ||
    matchMedia('(display-mode: fullscreen)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  if (standalone || document.fullscreenElement) return;
  document.documentElement
    .requestFullscreen?.({ navigationUI: 'hide' })
    .then(() => {
      // while we're properly fullscreen, also try to hold landscape
      (screen.orientation as unknown as { lock?: (o: string) => Promise<void> })
        .lock?.('landscape')
        .catch(() => {});
    })
    .catch(() => {});
}
