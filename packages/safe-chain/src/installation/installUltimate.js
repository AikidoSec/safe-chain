import { platform } from "os";
import { ui } from "../environment/userInteraction.js";
import { initializeCliArguments } from "../config/cliArguments.js";
import { installOnWindows, uninstallOnWindows } from "./installOnWindows.js";
import { installOnMacOS, uninstallOnMacOS } from "./installOnMacOS.js";

export async function uninstallUltimate() {
  initializeCliArguments(process.argv);

  const operatingSystem = platform();

  if (operatingSystem === "win32") {
    await uninstallOnWindows();
  } else if (operatingSystem === "darwin") {
    await uninstallOnMacOS();
  } else {
    ui.writeInformation(
      `Uninstall is not yet supported on ${operatingSystem}.`,
    );
  }
}

export async function installUltimate() {
  const operatingSystem = platform();

  if (operatingSystem === "win32") {
    await installOnWindows();
  } else if (operatingSystem === "darwin") {
    await installOnMacOS();
  } else {
    ui.writeInformation(
      `${operatingSystem} is not supported yet by SafeChain's ultimate version.`,
    );
  }
}
