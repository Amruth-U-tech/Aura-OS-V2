// ======================================================
// MEMBER HANDLER — Phase D3.2.2
// Guild member join/remove → HubAccessState reconciliation
// ======================================================

async function handleJoin(member) {
  console.log(`[Bot:Member] 👋 ${member.user?.tag || member.id} joined guild`);
  // Future: auto-sync HubAccessState for linked Aura players
}

async function handleRemove(member) {
  console.log(`[Bot:Member] 👋 ${member.user?.tag || member.id} left guild`);
  // Future: revoke HubAccessState, emit access revocation event
}

module.exports = { handleJoin, handleRemove };
