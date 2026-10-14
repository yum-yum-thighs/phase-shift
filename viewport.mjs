// Canvas content may be letterboxed in fullscreen. Input must use the rendered
// image rectangle rather than the entire CSS element.
export function contentRect(rect, width, height) {
  const scale = Math.min(rect.width / width, rect.height / height);
  const w = width * scale, h = height * scale;
  return {left: rect.left + (rect.width - w) / 2, top: rect.top + (rect.height - h) / 2, width: w, height: h};
}
export function worldPoint(rect, width, height, clientX, clientY, camera = 0) {
  const r = contentRect(rect, width, height);
  const x = (clientX - r.left) * width / r.width;
  const y = (clientY - r.top) * height / r.height;
  return {x: Math.max(0, Math.min(width, x)) + camera, y: Math.max(0, Math.min(height, y)), inside: x >= 0 && x <= width && y >= 0 && y <= height};
}
