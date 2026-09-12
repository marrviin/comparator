/**
 * True inside the macOS WKWebView (its userAgent reports "Macintosh"). Gates the
 * vibrancy look: on macOS the native window carries an NSVisualEffectView
 * (see tauri.conf.json `windowEffects`) and the window base goes translucent to
 * let the blur show through; other platforms keep the opaque bg-panel shell.
 */
export const isMac = navigator.userAgent.includes('Macintosh');
