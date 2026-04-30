/**
 * Lightweight in-process scheduler for periodic maintenance tasks.
 * Uses setInterval — no external dependency needed.
 *
 * In a horizontally-scaled deployment, only one instance should run sweeps.
 * A distributed lock (e.g. pg_advisory_lock or a Redis lock) can be added
 * here. For single-instance deployments this is sufficient.
 */

const logger = require('./logger');

const jobs = [];

/**
 * Register a recurring job.
 * @param {string} name        Human-readable job name for logging.
 * @param {number} intervalMs  How often to run (milliseconds).
 * @param {Function} fn        Async function to execute.
 * @param {boolean} runImmediately  Execute once at startup before scheduling.
 */
const schedule = (name, intervalMs, fn, runImmediately = false) => {
  const wrapper = async () => {
    try {
      const result = await fn();
      logger.debug(`Scheduler [${name}] completed`, { result });
    } catch (err) {
      logger.error(`Scheduler [${name}] failed`, { error: err.message });
    }
  };

  if (runImmediately) {
    // Small delay so the server fully initialises before the first sweep
    setTimeout(wrapper, 5000);
  }

  const handle = setInterval(wrapper, intervalMs);
  jobs.push({ name, handle });
  logger.info(`Scheduler: registered job "${name}" (every ${intervalMs / 1000}s)`);
};

const stopAll = () => {
  jobs.forEach(({ name, handle }) => {
    clearInterval(handle);
    logger.info(`Scheduler: stopped job "${name}"`);
  });
};

module.exports = { schedule, stopAll };
