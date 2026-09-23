import { getMinimumPackageAgeHours } from "../config/settings.js";

/**
 * The point in time before which a package is considered old enough to install.
 * Anything published after this cutoff is subject to the minimum package age check.
 *
 * This is deliberately a leaf module with no other imports, so that modules which
 * mock `config/settings.js` in their tests (e.g. `newPackagesDatabaseBuilder.spec.js`)
 * can depend on it without transitively pulling in network-capable code.
 *
 * @returns {Date}
 */
export function getMinimumPackageAgeCutoff() {
  return new Date(Date.now() - getMinimumPackageAgeHours() * 3600 * 1000);
}
