/* ==========================================================
   signature.js — HTML5 canvas signature pad with undo/clear.
   Exposes helpers: getSignature, clearSignature, loadSignature.
   ========================================================== */

export class SignaturePad {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.strokes = [];      // Array of arrays of {x,y}
    this.current = null;
    this.drawing = false;
    this.hasImage = false;  // true once a prefilled signature image has been loaded

    this._resize();
    window.addEventListener("resize", () => this._resize());

    this._attach();
  }

  _resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._redraw();
  }

  _attach() {
    const start = (e) => {
      e.preventDefault();
      this.drawing = true;
      this.current = [];
      this.strokes.push(this.current);
      this._point(e);
    };
    const move = (e) => {
      if (!this.drawing) return;
      e.preventDefault();
      this._point(e);
      this._redraw();
    };
    const end = () => { this.drawing = false; this.current = null; };

    this.canvas.addEventListener("mousedown", start);
    this.canvas.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);

    this.canvas.addEventListener("touchstart", start, { passive: false });
    this.canvas.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", end);
  }

  _point(e) {
    const rect = this.canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    const x = t.clientX - rect.left;
    const y = t.clientY - rect.top;
    if (this.current) this.current.push({ x, y });
  }

  _redraw() {
    const rect = this.canvas.getBoundingClientRect();
    this.ctx.clearRect(0, 0, rect.width, rect.height);
    this.ctx.lineWidth = 2;
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";
    this.ctx.strokeStyle = "#0f172a";

    for (const stroke of this.strokes) {
      if (!stroke.length) continue;
      this.ctx.beginPath();
      this.ctx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length; i++) this.ctx.lineTo(stroke[i].x, stroke[i].y);
      this.ctx.stroke();
    }
  }

  /** Returns true if user hasn't drawn anything AND no image was loaded. */
  isEmpty() {
    if (this.hasImage) return false;
    return this.strokes.length === 0 || this.strokes.every((s) => s.length === 0);
  }

  clearSignature() {
    this.strokes = [];
    this.hasImage = false;
    this._redraw();
  }

  undo() {
    this.strokes.pop();
    this._redraw();
  }

  /** Load a base64 PNG or remote (signed) URL onto the canvas. */
  loadSignature(dataUrlOrHttpUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const rect = this.canvas.getBoundingClientRect();
        this.ctx.clearRect(0, 0, rect.width, rect.height);
        this.ctx.drawImage(img, 0, 0, rect.width, rect.height);
        this.strokes = []; // treat as background, not undo-able strokes
        this.hasImage = true;
        resolve();
      };
      img.onerror = reject;
      img.src = dataUrlOrHttpUrl;
    });
  }

  /** Return base64 PNG (or null if empty). */
  getSignature() {
    if (this.isEmpty()) return null;
    return this.canvas.toDataURL("image/png");
  }

  /** Return a PNG Blob (or null). */
  async getSignatureBlob() {
    if (this.isEmpty()) return null;
    return await new Promise((resolve) => this.canvas.toBlob(resolve, "image/png"));
  }
}

/**
 * Mount all `.signature-block` widgets on a page.
 * Returns a map from data-name → SignaturePad instance.
 */
export function mountSignatures(root = document) {
  const pads = {};
  root.querySelectorAll(".signature-block").forEach((block) => {
    const name = block.dataset.name;
    const canvas = block.querySelector(".signature-canvas");
    const pad = new SignaturePad(canvas);
    pads[name] = pad;

    block.querySelector("[data-action='clear']")?.addEventListener("click", () => pad.clearSignature());
    block.querySelector("[data-action='undo']")?.addEventListener("click", () => pad.undo());
  });
  return pads;
}
