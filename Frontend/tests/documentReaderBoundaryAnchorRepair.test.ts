import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { measureOffsetY } from "../src/lib/documents/readerAnchorMeasure";

/**
 * Document reader authoring — paragraph-boundary anchor measurement repair.
 *
 * Live acceptance (after #436/#438/#439): a saved comment/proposal whose stored
 * startOffset lands exactly at the start of a paragraph that begins a new text
 * segment resolves, in the reader DOM, to the END of the preceding text node —
 * a node that ends with line breaks. A collapsed caret there measures a
 * degenerate all-zero rectangle in Chromium even though the text is laid out.
 * The old guard treated it as "no layout", returned null and dropped the
 * card/composer onto the sequential-stacking fallback far from its own anchor.
 *
 * The pinned contract: the measurement probes the adjacent caret positions
 * (start of the following text node first) and returns the anchor line Y;
 * only a truly unlaid-out DOM (every probe degenerate, e.g. jsdom) returns
 * null so the legacy fallback behaviour is unchanged.
 */

const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (html?: string, options?: any) => any;
};

function rect(top: number, bottom: number) {
  return { top, bottom, height: bottom - top, left: 0, right: 800, width: 800, x: 0, y: top, toJSON: () => ({}) };
}

/** Global text offset of a DOM point relative to the article root. */
function globalTextOffset(root: any, containerNode: any, offset: number): number {
  const walker = root.ownerDocument.createTreeWalker(root, 4);
  let total = 0;
  let node = walker.nextNode();
  while (node) {
    if (node === containerNode) return total + offset;
    total += node.data.length;
    node = walker.nextNode();
  }
  return total;
}

function buildDom() {
  const dom = new JSDOM('<!doctype html><html><body><div id="container"></div></body></html>', {
    pretendToBeVisual: true,
  });
  const doc = dom.window.document;
  const container = doc.getElementById("container")!;
  const article = doc.createElement("article");
  const firstParagraph = "Első bekezdés szövege, ami itt véget ér.\n\n";
  article.appendChild(doc.createTextNode(firstParagraph));
  const mark = doc.createElement("mark");
  mark.appendChild(doc.createTextNode("145. § A második bekezdés eleje."));
  article.appendChild(mark);
  article.appendChild(doc.createTextNode(" A második bekezdés folytatása."));
  container.appendChild(article);
  return { dom, container, article, boundaryOffset: firstParagraph.length };
}

test("a paragraph-start boundary offset measures at its own anchor line instead of null", () => {
  const { dom, container, article, boundaryOffset } = buildDom();
  const originalElementRect = dom.window.Element.prototype.getBoundingClientRect;
  const originalRangeRect = dom.window.Range.prototype.getBoundingClientRect;
  try {
    dom.window.Element.prototype.getBoundingClientRect = function () {
      return rect(0, 9000);
    };
    // Chromium model: a caret at the END of a text node that ends with a line
    // break measures an all-zero rectangle; every other caret has a real rect.
    dom.window.Range.prototype.getBoundingClientRect = function () {
      const node: any = this.startContainer;
      const atNewlineEnd = this.startOffset === node.data.length && node.data.endsWith("\n");
      if (atNewlineEnd) return { top: 0, bottom: 0, height: 0, width: 0, left: 0, right: 0, x: 0, y: 0, toJSON: () => ({}) };
      const top = 100 + globalTextOffset(article, node, this.startOffset);
      return rect(top, top + 16);
    };

    assert.equal(measureOffsetY(container, article, boundaryOffset), 100 + boundaryOffset,
      "the boundary anchor resolves to the following paragraph's first line");
    assert.equal(measureOffsetY(container, article, 5), 105,
      "mid-node offsets keep the exact measurement path");
    assert.equal(measureOffsetY(container, article, boundaryOffset - 1), 100 + boundaryOffset - 1,
      "the character before the boundary is unaffected");
  } finally {
    dom.window.Element.prototype.getBoundingClientRect = originalElementRect;
    dom.window.Range.prototype.getBoundingClientRect = originalRangeRect;
    dom.window.close();
  }
});

test("a fully degenerate layout still returns null so the legacy fallback survives", () => {
  const { dom, container, article, boundaryOffset } = buildDom();
  const originalElementRect = dom.window.Element.prototype.getBoundingClientRect;
  const originalRangeRect = dom.window.Range.prototype.getBoundingClientRect;
  try {
    dom.window.Element.prototype.getBoundingClientRect = function () {
      return rect(0, 9000);
    };
    dom.window.Range.prototype.getBoundingClientRect = function () {
      return { top: 0, bottom: 0, height: 0, width: 0, left: 0, right: 0, x: 0, y: 0, toJSON: () => ({}) };
    };
    assert.equal(measureOffsetY(container, article, boundaryOffset), null,
      "unlaid-out DOM keeps the null fallback for deterministic stacking");
    assert.equal(measureOffsetY(container, article, 5), null);
  } finally {
    dom.window.Element.prototype.getBoundingClientRect = originalElementRect;
    dom.window.Range.prototype.getBoundingClientRect = originalRangeRect;
    dom.window.close();
  }
});
