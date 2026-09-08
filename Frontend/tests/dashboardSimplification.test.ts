import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(path.join(process.cwd(), "src/components/DashboardFocused.tsx"), "utf8");

test("dashboard orientation surface uses category cards and hides redundant detail walls", () => {
    assert.match(source, /Milyen munkák várnak rám\?/);
    assert.match(source, /attentionCategory=/);
    assert.match(source, /operational && operationalPresentation && false \? <>/);
});

test("dashboard communications aggregate by client and scope the canonical workspace", () => {
    assert.match(source, /clientCommunicationSummaries/);
    assert.match(source, /communications\?clientId=/);
    assert.doesNotMatch(source, /dashboardCommunications\.map/);
});

test("dashboard keeps legal news as an identifiable card", () => {
    assert.match(source, /dashboard-legal-news-heading/);
    assert.match(source, /getNewsFeed\("legal"\)/);
});
