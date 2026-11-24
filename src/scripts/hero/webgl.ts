// Whether this browser can make a WebGL2 context. Shared by the loader (in the page bundle, to decide before
// the scene chunk loads whether the console waits for the melt) and the scene.

/** Probes on a throwaway canvas, so a real one is untouched; the probe never stays a live context. */
export function hasWebGL2(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}
