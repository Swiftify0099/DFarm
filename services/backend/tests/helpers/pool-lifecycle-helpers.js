/**
 * Shared pool shutdown helper for unit and real PostgreSQL 17 lifecycle tests.
 * Ensures concurrent callers share one in-flight shutdown, checked-out clients
 * block closure without poisoning closedPools, removal timeouts surface loudly,
 * and closedPools is marked strictly after verified client removal and pool.end().
 */
export function createPoolShutdownManager(defaults = {}) {
  const closedPools = new WeakSet();
  const poolShutdownPromises = new WeakMap();

  const defaultCheckedOutTimeoutMs = defaults.checkedOutTimeoutMs ?? 8000;
  const defaultRemoveTimeoutMs = defaults.removeTimeoutMs ?? 3000;
  const defaultExternalEndTimeoutMs = defaults.externalEndTimeoutMs ?? 8000;
  const defaultPollIntervalMs = defaults.pollIntervalMs ?? 25;

  const closePoolCleanly = async (pool, label, closeAction, options = {}) => {
    if (!pool) return;

    // If a shutdown is already in-flight for this pool, await the exact same
    // Promise so concurrent callers never trigger duplicate shutdowns.
    const inflight = poolShutdownPromises.get(pool);
    if (inflight) {
      return inflight;
    }

    // Only skip if a previous shutdown completed cleanly.
    if (closedPools.has(pool)) return;

    const checkedOutTimeoutMs = options.checkedOutTimeoutMs ?? defaultCheckedOutTimeoutMs;
    const removeTimeoutMs = options.removeTimeoutMs ?? defaultRemoveTimeoutMs;
    const externalEndTimeoutMs = options.externalEndTimeoutMs ?? defaultExternalEndTimeoutMs;
    const pollIntervalMs = options.pollIntervalMs ?? defaultPollIntervalMs;

    const shutdownPromise = (async () => {
      // Wait for all checked-out or waiting clients to settle before teardown.
      const deadline = Date.now() + checkedOutTimeoutMs;
      while (Date.now() < deadline) {
        if (pool.totalCount === pool.idleCount && pool.waitingCount === 0) break;
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }
      if (pool.totalCount !== pool.idleCount || pool.waitingCount > 0) {
        throw new Error(
          `Pool '${label}' still had checked-out or waiting clients before teardown (total=${pool.totalCount}, idle=${pool.idleCount}, waiting=${pool.waitingCount}).`
        );
      }

      const wasAlreadyEnded = Boolean(pool.ended);
      const expectedRemovals = Number(pool.totalCount || 0);
      let removedCount = 0;
      let resolveRemoved;
      const removedPromise =
        expectedRemovals > 0
          ? new Promise((resolve) => {
              resolveRemoved = resolve;
            })
          : Promise.resolve();

      const onRemove = () => {
        removedCount += 1;
        if (removedCount >= expectedRemovals && resolveRemoved) {
          resolveRemoved();
        }
      };

      if (expectedRemovals > 0) {
        pool.on('remove', onRemove);
      }

      let removeTimer;
      try {
        if (closeAction) {
          await closeAction();
        } else if (pool.ending && !pool.ended) {
          const endDeadline = Date.now() + externalEndTimeoutMs;
          while (!pool.ended && Date.now() < endDeadline) {
            await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
          }
          if (!pool.ended) {
            throw new Error(`Pool '${label}' external shutdown did not finish before timeout.`);
          }
        } else if (!pool.ended) {
          await pool.end();
        }

        if (expectedRemovals > 0 && removedCount < expectedRemovals) {
          await Promise.race([
            removedPromise,
            new Promise((resolve) => {
              removeTimer = setTimeout(resolve, removeTimeoutMs);
            }),
          ]);
        }

        if (expectedRemovals > 0 && !wasAlreadyEnded && removedCount < expectedRemovals) {
          throw new Error(
            `Pool '${label}' did not remove all expected clients during teardown (removed=${removedCount}, expected=${expectedRemovals}, totalCount=${pool.totalCount}, ended=${pool.ended}).`
          );
        }

        // Mark successfully closed ONLY after clients and shutdown have verified clean completion.
        closedPools.add(pool);
      } finally {
        if (removeTimer) {
          clearTimeout(removeTimer);
        }
        if (expectedRemovals > 0) {
          pool.off('remove', onRemove);
        }
      }
    })();

    poolShutdownPromises.set(pool, shutdownPromise);
    try {
      await shutdownPromise;
    } finally {
      // Clear in-flight entry once settled so a failed close (e.g. checked-out
      // client) can be retried after releasing the client rather than replaying
      // a stale rejection or skipping the pool.
      if (poolShutdownPromises.get(pool) === shutdownPromise) {
        poolShutdownPromises.delete(pool);
      }
    }
  };

  return {
    closePoolCleanly,
    closedPools,
    poolShutdownPromises,
  };
}
