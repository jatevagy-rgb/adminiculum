# Client Color Communication Projection

The persisted `Communication.clientId` is the only identity source. The list query collects distinct assigned client IDs and resolves all colors in one batched `Client` query. Unassigned or missing clients map to `null`.

The selected communication workspace is derived from the refreshed list item and therefore uses the same `clientColorKey`. The gated detail endpoint also returns the current color. Sender, recipient, subject, and email domain are never used for inference.

Assignment UI state does not cache a separate color. A subsequent list refresh is authoritative.
