#!/usr/bin/env node
/**
 * provision-anchor.js — deterministic stable source anchor construction.
 *
 * A future legal-review candidate references a provision via a multi-part,
 * stable anchor. The PRIMARY stable identity is:
 *   sourceKey + sourceSha256 + provisionReference + excerptSha256.
 * Line/span location is ADVISORY capture-time data only and must be re-verified
 * against the current file checksum before any use.
 *
 * This module produces anchor OBJECTS only. It makes no legal claim and never
 * decides which version is applicable.
 */

'use strict';

const crypto = require('crypto');

/** SHA-256 of a UTF-8 string. */
function sha256Text(text) {
  return crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
}

/** Collapse internal whitespace and trim (used ONLY for the excerpt hash, not
 *  for canonical text preservation). */
function compactForHash(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Build a stable provision anchor.
 *
 * @param {object} opts
 *   sourceKey            canonical source key (e.g. HU:ACT:1995:LIII)
 *   sourceSha256         sha256 of the source file at capture time
 *   provisionReference   explicit provision identifier, e.g. "21. § (1)" / "31. cikk (1)"
 *   heading              nearby heading if explicitly present (optional)
 *   lineStart,lineEnd    advisory line span at capture time (optional)
 *   excerpt              normalized provision excerpt text (used for excerptSha256)
 * @returns {object} anchor
 */
function buildAnchor(opts) {
  const sourceKey = opts.sourceKey || null;
  const sourceSha256 = opts.sourceSha256 || null;
  const provisionReference = (opts.provisionReference || '').trim() || null;
  const heading = (opts.heading || '').trim() || null;
  const lineStart = Number.isInteger(opts.lineStart) ? opts.lineStart : null;
  const lineEnd = Number.isInteger(opts.lineEnd) ? opts.lineEnd : null;
  const excerpt = opts.excerpt != null ? String(opts.excerpt) : null;

  const excerptSha256 = excerpt != null ? sha256Text(compactForHash(excerpt)) : null;

  return {
    sourceKey,
    sourceSha256,
    provisionReference,
    headingContext: heading,
    lineSpan: lineStart != null || lineEnd != null ? { start: lineStart, end: lineEnd } : null,
    excerptSha256,
    note: 'lineSpan is advisory capture-time data only; primary identity is sourceKey+sourceSha256+provisionReference+excerptSha256.',
  };
}

/** True when an anchor carries the primary stable identity fields. */
function hasPrimaryIdentity(anchor) {
  return Boolean(anchor && anchor.sourceKey && anchor.sourceSha256 && anchor.provisionReference && anchor.excerptSha256);
}

module.exports = {
  sha256Text,
  compactForHash,
  buildAnchor,
  hasPrimaryIdentity,
};
