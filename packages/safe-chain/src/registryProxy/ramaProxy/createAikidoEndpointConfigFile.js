import { writeFile } from "fs";
import { join } from "path/posix";
import { promisify } from "util";
import {
  getMinimumPackageAgeHours,
  skipMinimumPackageAge,
} from "../../config/settings.js";

/**
 *
 * @param {string} dataFolder
 * @returns string
 */
export async function createAikidoEndpointConfigFile(dataFolder) {
  const configPath = join(dataFolder, "safe-chain-config.json");

  const config = getConfigContent();
  const configJson = JSON.stringify(config);

  await promisify(writeFile)(configPath, configJson);

  return configPath;
}

function getConfigContent() {
  let cutoff = Math.floor(Date.now() / 1000);

  if (!skipMinimumPackageAge()) {
    cutoff = cutoff - (getMinimumPackageAgeHours() * 3600);
  }

  return {
    permission_group: {
      id: 1,
      name: "Default",
    },
    ecosystems: {
      npm: {
        block_all_installs: false,
        request_installs: false,
        minimum_allowed_age_timestamp: cutoff,
        exceptions: {
          allowed_packages: [],
          rejected_packages: [],
        },
      },
      pypi: {
        block_all_installs: false,
        request_installs: false,
        minimum_allowed_age_timestamp: cutoff,
        exceptions: {
          allowed_packages: [],
          rejected_packages: [],
        },
      },
    },
  };
}

/*

# Reference: config file format.

```json
{  
  "permission_group": {
    "id": 18,
    "name": "Default"
  },
  "ecosystems": {
    "npm": {
      "block_all_installs": false,
      "request_installs": false,
      "minimum_allowed_age_timestamp": 1778143932,
      "exceptions": {
        "allowed_packages": [],
        "rejected_packages": []
      }
    },
    "pypi": {
      "block_all_installs": false,
      "request_installs": false,
      "minimum_allowed_age_timestamp": 1778057532,
      "exceptions": {
        "allowed_packages": [],
        "rejected_packages": []
      }
    }
  }
}
```

*/
