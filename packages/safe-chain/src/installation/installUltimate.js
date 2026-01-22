import { platform } from "os";
import { ui } from "../environment/userInteraction.js";
import { initializeCliArguments } from "../config/cliArguments.js";
import { installOnWindows } from "./installOnWindows.js";
import { installOnMacOS } from "./installOnMacOS.js";

export async function installUltimate() {
  initializeCliArguments(process.argv);

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
