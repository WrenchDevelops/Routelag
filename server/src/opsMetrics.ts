/**
 * In-process counters for beta monitoring. Reset on process restart.
 * Exposed only via authenticated admin status — not on public /health.
 */
export class OpsMetrics {
  peerCreateOk = 0;
  peerCreateFail = 0;
  peerRemoveOk = 0;
  peerRemoveFail = 0;
  peerExpired = 0;
  peerExpireFail = 0;
  heartbeatOk = 0;
  capacityRejected = 0;
  concurrentRejected = 0;
  maintenanceRejected = 0;
  nodeDisabledRejected = 0;
  userBlockedRejected = 0;
  appVersionRejected = 0;
  authFailures = 0;
  adminAuthFailures = 0;
  orphanPeersRemoved = 0;
  startedAt = new Date().toISOString();

  snapshot() {
    return {
      startedAt: this.startedAt,
      peerCreateOk: this.peerCreateOk,
      peerCreateFail: this.peerCreateFail,
      peerRemoveOk: this.peerRemoveOk,
      peerRemoveFail: this.peerRemoveFail,
      peerExpired: this.peerExpired,
      peerExpireFail: this.peerExpireFail,
      heartbeatOk: this.heartbeatOk,
      capacityRejected: this.capacityRejected,
      concurrentRejected: this.concurrentRejected,
      maintenanceRejected: this.maintenanceRejected,
      nodeDisabledRejected: this.nodeDisabledRejected,
      userBlockedRejected: this.userBlockedRejected,
      appVersionRejected: this.appVersionRejected,
      authFailures: this.authFailures,
      adminAuthFailures: this.adminAuthFailures,
      orphanPeersRemoved: this.orphanPeersRemoved,
    };
  }
}
