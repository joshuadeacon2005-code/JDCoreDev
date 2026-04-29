/**
 * DB Bridge — connects the pipeline (pure JS) to the TypeScript storage layer.
 *
 * The Express server calls initDbBridge() on startup, passing the storage
 * function references.  Pipeline modules call the exported helpers which
 * forward to the real database, or silently no-op if the bridge hasn't been
 * initialised yet (e.g. during unit tests).
 */

let _upsertLeadAudit          = null;
let _updateLeadAuditStatus    = null;
let _updateLeadAuditHtml      = null;
let _getLeadAuditBySlug       = null;
let _deleteLeadAudit          = null;
let _createLeadDraft          = null;
let _markLeadDraftSent        = null;
let _updateLeadDraft          = null;
let _deleteLeadDraft          = null;
let _getAllLeadAudits          = null;
let _getAllLeadDrafts          = null;
let _getLeadEngineSettings    = null;
let _upsertLeadEngineSettings = null;

export function initDbBridge(fns) {
  _upsertLeadAudit          = fns.upsertLeadAudit;
  _updateLeadAuditStatus    = fns.updateLeadAuditStatus;
  _updateLeadAuditHtml      = fns.updateLeadAuditHtml;
  _getLeadAuditBySlug       = fns.getLeadAuditBySlug;
  _deleteLeadAudit          = fns.deleteLeadAudit;
  _createLeadDraft          = fns.createLeadDraft;
  _markLeadDraftSent        = fns.markLeadDraftSent;
  _updateLeadDraft          = fns.updateLeadDraft;
  _deleteLeadDraft          = fns.deleteLeadDraft;
  _getAllLeadAudits          = fns.getAllLeadAudits;
  _getAllLeadDrafts          = fns.getAllLeadDrafts;
  _getLeadEngineSettings    = fns.getLeadEngineSettings;
  _upsertLeadEngineSettings = fns.upsertLeadEngineSettings;
}

export async function dbUpsertAudit(data) {
  try { if (_upsertLeadAudit) await _upsertLeadAudit(data); }
  catch (e) { console.error('[DbBridge] upsertAudit error:', e.message); }
}

export async function dbUpdateAuditStatus(domain, status) {
  try { if (_updateLeadAuditStatus) await _updateLeadAuditStatus(domain, status); }
  catch (e) { console.error('[DbBridge] updateAuditStatus error:', e.message); }
}

export async function dbUpdateAuditHtml(domain, html) {
  try { if (_updateLeadAuditHtml) await _updateLeadAuditHtml(domain, html); }
  catch (e) { console.error('[DbBridge] updateAuditHtml error:', e.message); }
}

export async function dbGetAuditBySlug(slug) {
  try { if (_getLeadAuditBySlug) return await _getLeadAuditBySlug(slug); }
  catch (e) { console.error('[DbBridge] getAuditBySlug error:', e.message); }
  return null;
}

export async function dbCreateDraft(data) {
  try {
    if (_createLeadDraft) return await _createLeadDraft(data);
  } catch (e) { console.error('[DbBridge] createDraft error:', e.message); }
  return null;
}

export async function dbMarkDraftSent(id) {
  try { if (_markLeadDraftSent) await _markLeadDraftSent(id); }
  catch (e) { console.error('[DbBridge] markDraftSent error:', e.message); }
}

export async function dbUpdateDraft(id, data) {
  try { if (_updateLeadDraft) await _updateLeadDraft(id, data); }
  catch (e) { console.error('[DbBridge] updateDraft error:', e.message); }
}

export async function dbDeleteAudit(domain) {
  try { if (_deleteLeadAudit) await _deleteLeadAudit(domain); }
  catch (e) { console.error('[DbBridge] deleteAudit error:', e.message); }
}

export async function dbDeleteDraft(id) {
  try { if (_deleteLeadDraft) await _deleteLeadDraft(id); }
  catch (e) { console.error('[DbBridge] deleteDraft error:', e.message); }
}

export async function dbGetSettings() {
  try { if (_getLeadEngineSettings) return await _getLeadEngineSettings(); }
  catch (e) { console.error('[DbBridge] getSettings error:', e.message); }
  return null;
}

export async function dbSaveSettings(data) {
  try { if (_upsertLeadEngineSettings) await _upsertLeadEngineSettings(data); }
  catch (e) { console.error('[DbBridge] saveSettings error:', e.message); }
}

export async function dbGetAllAudits() {
  try { if (_getAllLeadAudits) return await _getAllLeadAudits(); }
  catch (e) { console.error('[DbBridge] getAllAudits error:', e.message); }
  return [];
}

export async function dbGetAllDrafts() {
  try { if (_getAllLeadDrafts) return await _getAllLeadDrafts(); }
  catch (e) { console.error('[DbBridge] getAllDrafts error:', e.message); }
  return [];
}
