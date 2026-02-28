function assertNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${fieldName} is required`);
  }
}

function trimTrailingSlash(value) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

async function readJson(response) {
  const payload = await response.json();
  if (response.ok) {
    return payload;
  }

  const code = typeof payload?.code === 'string' ? payload.code : 'runtime_fetch_failed';
  const error = new Error(payload?.message || 'Runtime fetch failed');
  error.code = code;
  error.statusCode = response.status;
  error.details = payload?.details || null;
  throw error;
}

async function resolveRuntimeVersion({ apiBaseUrl, host, fetchImpl = fetch }) {
  assertNonEmptyString(apiBaseUrl, 'apiBaseUrl');
  assertNonEmptyString(host, 'host');

  const baseUrl = trimTrailingSlash(apiBaseUrl.trim());
  const response = await fetchImpl(`${baseUrl}/api/v1/public/runtime/resolve?host=${encodeURIComponent(host)}`);
  return readJson(response);
}

async function fetchRuntimeSnapshot({ apiBaseUrl, storageKey, siteId, versionId, fetchImpl = fetch }) {
  assertNonEmptyString(apiBaseUrl, 'apiBaseUrl');

  const baseUrl = trimTrailingSlash(apiBaseUrl.trim());
  let endpoint;
  if (typeof storageKey === 'string' && storageKey.trim()) {
    const query = `storageKey=${encodeURIComponent(storageKey)}`;
    endpoint = `${baseUrl}/api/v1/public/runtime/snapshot/by-storage-key?${query}`;
  } else {
    assertNonEmptyString(siteId, 'siteId');
    assertNonEmptyString(versionId, 'versionId');
    const query = `siteId=${encodeURIComponent(siteId)}&versionId=${encodeURIComponent(versionId)}`;
    endpoint = `${baseUrl}/api/v1/public/runtime/snapshot?${query}`;
  }

  const response = await fetchImpl(endpoint);
  return readJson(response);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderRuntimeHtml(snapshotEnvelope) {
  const sections = Array.isArray(snapshotEnvelope?.snapshot?.sections) ? snapshotEnvelope.snapshot.sections : [];
  const sectionMarkup = sections
    .map((section) => {
      const heading = escapeHtml(section.sectionId || section.componentId || 'section');
      const slots = section.slots && typeof section.slots === 'object' ? Object.values(section.slots) : [];
      const slotMarkup = slots.map((slot) => `<p>${escapeHtml(slot)}</p>`).join('');
      return `<section data-section="${heading}"><h2>${heading}</h2>${slotMarkup}</section>`;
    })
    .join('');

  return `<!doctype html><html><body>${sectionMarkup}</body></html>`;
}

async function renderSiteFromRuntime({ apiBaseUrl, host, fetchImpl = fetch }) {
  const resolved = await resolveRuntimeVersion({ apiBaseUrl, host, fetchImpl });
  const storageKey = typeof resolved?.storageKey === 'string' ? resolved.storageKey.trim() : '';
  const siteId = typeof resolved?.siteId === 'string' ? resolved.siteId.trim() : '';
  const versionId = typeof resolved?.versionId === 'string' ? resolved.versionId.trim() : '';
  if (!storageKey && (!siteId || !versionId)) {
    const error = new Error('Runtime resolve payload must include storageKey or siteId+versionId');
    error.code = 'runtime_resolve_incomplete';
    error.details = {
      hasStorageKey: Boolean(storageKey),
      hasSiteId: Boolean(siteId),
      hasVersionId: Boolean(versionId)
    };
    throw error;
  }

  let snapshot;
  if (storageKey) {
    try {
      snapshot = await fetchRuntimeSnapshot({
        apiBaseUrl,
        storageKey,
        fetchImpl
      });
    } catch (error) {
      if (error?.code !== 'runtime_snapshot_not_found' || !siteId || !versionId) {
        throw error;
      }

      snapshot = await fetchRuntimeSnapshot({
        apiBaseUrl,
        siteId,
        versionId,
        fetchImpl
      });
    }
  } else {
    snapshot = await fetchRuntimeSnapshot({
      apiBaseUrl,
      siteId,
      versionId,
      fetchImpl
    });
  }

  return {
    resolved,
    snapshot,
    html: renderRuntimeHtml(snapshot)
  };
}

module.exports = {
  resolveRuntimeVersion,
  fetchRuntimeSnapshot,
  renderRuntimeHtml,
  renderSiteFromRuntime
};
