import { createServer } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow, Menu, dialog, shell } from "electron";
import { createApp } from "../dist-server/app.js";

const isDevelopment = !app.isPackaged;

if (isDevelopment) {
  const dotenv = await import("dotenv");
  dotenv.config();
}

let mainWindow = null;
let localServer = null;
let localServerUrl = null;

app.setName("Mimo Chat Lab");

function getConfigPaths() {
  const configDir = app.getPath("userData");

  return {
    configDir,
    configFile: path.join(configDir, "config.json"),
    readmeFile: path.join(configDir, "README.txt")
  };
}

function ensureConfigFiles() {
  const { configDir, configFile, readmeFile } = getConfigPaths();
  fs.mkdirSync(configDir, { recursive: true });

  if (!fs.existsSync(configFile)) {
    fs.writeFileSync(configFile, `${JSON.stringify({ MIMO_API_KEY: "" }, null, 2)}\n`, "utf8");
  }

  if (!fs.existsSync(readmeFile)) {
    fs.writeFileSync(
      readmeFile,
      [
        "Mimo Chat Lab desktop configuration",
        "",
        "Set your Xiaomi MiMo API key in config.json:",
        "",
        "{",
        "  \"MIMO_API_KEY\": \"your_key_here\"",
        "}",
        "",
        "After changing config.json, restart Mimo Chat Lab or use App > Reload API Key."
      ].join("\n"),
      "utf8"
    );
  }
}

function readApiKeyFromConfig() {
  const { configFile } = getConfigPaths();

  try {
    const rawConfig = fs.readFileSync(configFile, "utf8");
    const parsedConfig = JSON.parse(rawConfig);
    const configuredKey = parsedConfig.MIMO_API_KEY ?? parsedConfig.mimoApiKey;

    return typeof configuredKey === "string" && configuredKey.trim()
      ? configuredKey.trim()
      : null;
  } catch (error) {
    console.error("Unable to read desktop config:", error);
    return null;
  }
}

function getMimoApiKey() {
  return process.env.MIMO_API_KEY?.trim() || readApiKeyFromConfig();
}

function saveApiKeyToConfig(apiKey) {
  const { configFile } = getConfigPaths();
  const existingConfig = (() => {
    try {
      return JSON.parse(fs.readFileSync(configFile, "utf8"));
    } catch {
      return {};
    }
  })();

  fs.writeFileSync(
    configFile,
    `${JSON.stringify({ ...existingConfig, MIMO_API_KEY: apiKey }, null, 2)}\n`,
    "utf8"
  );
}

function restartApplication() {
  app.relaunch();
  app.exit(0);
}

function openApiKeyConfigFolder() {
  const { configFile } = getConfigPaths();

  shell.showItemInFolder(configFile);
}

function startLocalServer() {
  return new Promise((resolve, reject) => {
    const apiKey = getMimoApiKey() ?? undefined;
    const expressApp = createApp({
      apiKey,
      desktopConfig: {
        hasApiKey: () => Boolean(getMimoApiKey()),
        saveApiKey: saveApiKeyToConfig,
        restartApp: restartApplication
      }
    });
    const server = createServer(expressApp);

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();

      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Unable to resolve the local server address."));
        return;
      }

      resolve({
        server,
        url: `http://127.0.0.1:${address.port}`
      });
    });
  });
}

async function stopLocalServer() {
  if (!localServer) {
    return;
  }

  await new Promise((resolve) => {
    localServer.close(() => resolve());
  });

  localServer = null;
  localServerUrl = null;
}

async function restartLocalServer() {
  await stopLocalServer();
  const serverInfo = await startLocalServer();
  localServer = serverInfo.server;
  localServerUrl = serverInfo.url;

  if (mainWindow) {
    await mainWindow.loadURL(localServerUrl);
  }
}

function createApplicationMenu() {
  return Menu.buildFromTemplate([
    {
      label: "App",
      submenu: [
        {
          label: "Open API Key Config",
          click: openApiKeyConfigFolder
        },
        {
          label: "Reload API Key",
          click: async () => {
            try {
              await restartLocalServer();
            } catch (error) {
              console.error("Failed to reload API key:", error);
              dialog.showErrorBox("Unable to reload API key", String(error));
            }
          }
        },
        { type: "separator" },
        { role: "quit" }
      ]
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" }
      ]
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools", visible: isDevelopment },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "close" }]
    }
  ]);
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 680,
    title: "Mimo Chat Lab",
    backgroundColor: "#f8f3ea",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(localServerUrl ?? "")) {
      shell.openExternal(url);
    }

    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(localServerUrl ?? "")) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(localServerUrl);
}

async function bootstrap() {
  ensureConfigFiles();

  await restartLocalServer();
  Menu.setApplicationMenu(createApplicationMenu());
  await createMainWindow();
}

app.whenReady().then(bootstrap).catch((error) => {
  console.error("Failed to start Mimo Chat Lab:", error);
  dialog.showErrorBox("Mimo Chat Lab failed to start", String(error));
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0 && localServerUrl) {
    await createMainWindow();
  }
});

app.on("before-quit", () => {
  if (localServer) {
    localServer.close();
    localServer = null;
  }
});
