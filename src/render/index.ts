// render — headless RenderFrame (buildFrame, camera) + renderers (§13, §17).
export { buildFrame } from './frame';
export type { RenderFrame, FrameCell, Overlay } from './frame';
export { cameraLevel, viewportOrigin } from './camera';
export type { Camera, Viewport } from './camera';
export type { Renderer } from './renderer';
export { AsciiRenderer } from './ascii-renderer';
export { CanvasRenderer } from './canvas-renderer';
export type { Ctx2D, CanvasRendererOptions } from './canvas-renderer';
