import { platform } from "os";
import { ui } from "../environment/userInteraction.js";
import { initializeCliArguments } from "../config/cliArguments.js";
import { installOnWindows } from "./installOnWindows.js";

export async function installUltimate() {
  initializeCliArguments(process.argv);

  const operatingSystem = platform();

  if (operatingSystem === "win32") {
    await installOnWindows();
  } else {
    ui.writeInformation(
      `${operatingSystem} is not supported yet by safe-chain's ultimate version.`,
    );
  }
}
