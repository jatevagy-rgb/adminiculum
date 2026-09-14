import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

describe("Universal mailbox frontend contract", () => {
  const panel = () => read("src/components/communications/MailboxAccountsPanel.tsx");
  const workspace = () => read("src/components/communications/CommunicationWorkspace.tsx");
  const api = () => read("src/lib/api.ts");

  it("exposes owner mailbox setup with truthful provider and lifecycle states", () => {
    const src = panel();
    for (const token of ["Email-fiókok", "Email-fiók csatlakoztatása", "Microsoft", "Google", "Egyéb", "Kapcsolódva", "Csak olvasás", "Újraengedélyezés", "Szinkronizálás", "Leválasztás"]) {
      assert.match(src, new RegExp(token));
    }
    assert.match(src, /IMAP_SMTP/);
    assert.match(src, /jelenleg nincs bekapcsolva/);
    assert.doesNotMatch(src, /secretReference|accessToken|refreshToken|verificationCode|providerError|dangerouslySetInnerHTML/);
  });

  it("uses the documented mailbox endpoints and preserves canonical Communication", () => {
    const source = api() + panel() + workspace();
    for (const token of ["/mailboxes", "/verification/start", "/verification/confirm", "/authorize/", "/sync", "/disconnect", "/send", "getCommunications", "Meglévő ügyhöz kapcsolás", "Új ügy létrehozása", "Ügy megnyitása"]) {
      assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.match(workspace(), /Email-fiókok/);
    assert.doesNotMatch(workspace(), /dangerouslySetInnerHTML/);
  });

  it("keeps send actions capability-gated and owner/case boundaries visible", () => {
    const src = read("src/components/communications/CommunicationWorkspace.tsx");
    assert.match(src, /mailboxConnection\?\.sendCapability/);
    assert.match(src, /Válasz/);
    assert.match(src, /Válasz mindenkinek/);
    assert.match(src, /Továbbítás/);
    assert.match(src, /this\.communication|kommunikáció/);
    assert.doesNotMatch(src, /Ez az Ön ügye/);
    assert.doesNotMatch(src, /setTimeout\([^)]*time/i);
  });

  it("starts OAuth immediately after verification and presents only safe callback states", () => {
    const src = panel();
    assert.match(src, /confirmMailboxVerification/);
    assert.match(src, /startMailboxAuthorization\(result\.mailbox\.id, provider\)/);
    assert.match(src, /window\.location\.assign\(authorization\.authorizationUrl\)/);
    assert.match(src, /provider === "IMAP_SMTP"/);
    assert.match(src, /connected: \{ tone: "success"/);
    assert.match(src, /Az e-mail-fiók engedélyezése nem sikerült/);
    assert.doesNotMatch(src, /params\.get\("code"\)|params\.get\("state"\)|providerError|accessToken|refreshToken/);
  });

  it("uses structured Reply All and truthful Forward data without arbitrary case authority", () => {
    const src = workspace();
    assert.match(src, /buildReplyAllRecipients/);
    assert.match(src, /buildForwardBody/);
    assert.match(src, /replyToCommunicationId: composerMode === "forward" \? null : item\.id/);
    assert.match(src, /contextCommunicationId: composerMode === "forward" \? item\.id : null/);
    assert.doesNotMatch(src, /cc: composerMode === "replyAll" && detail\?\.recipientEmail/);
    const sendBlock = src.slice(src.indexOf("await sendMailboxMessage({"), src.indexOf("});", src.indexOf("await sendMailboxMessage({")));
    assert.doesNotMatch(sendBlock, /\b(caseId|clientId)\s*:/);
    assert.match(src, /Az eredeti mellékletek nem kerülnek automatikusan továbbításra/);
    assert.doesNotMatch(src, /dangerouslySetInnerHTML|bodyHtmlSanitized/);
  });
});
