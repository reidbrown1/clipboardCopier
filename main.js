const { app, BrowserWindow, globalShortcut, clipboard } = require('electron');
const path = require('path');
const url = require('url');
const https = require('https');
const fs = require('fs');

// Keep a global reference of the window object
let mainWindow;

// Anthropic API configuration
// Read API key from .env file or environment variables
let ANTHROPIC_API_KEY = '';
try {
  // First try to load from .env file if it exists
  if (fs.existsSync(path.join(__dirname, '.env'))) {
    const envFile = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    const keyMatch = envFile.match(/ANTHROPIC_API_KEY=([^\r\n]+)/);
    if (keyMatch && keyMatch[1]) {
      ANTHROPIC_API_KEY = keyMatch[1].trim();
    }
  }
  // If not found in .env, try environment variables
  if (!ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY) {
    ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  }
} catch (error) {
  console.error('Error loading API key:', error);
}

const ANTHROPIC_MODEL = 'claude-3-7-sonnet-20250219';

// Function to call Anthropic API
async function callAnthropicAPI(clipboardText) {
  return new Promise((resolve, reject) => {
    if (!ANTHROPIC_API_KEY) {
      reject('API key not found. Please add ANTHROPIC_API_KEY to a .env file or environment variables.');
      return;
    }

    const data = JSON.stringify({
      model: ANTHROPIC_MODEL,
      messages: [
        { role: "user", content: `I want you to answer the question of the following text: ${clipboardText}` }
      ],
      max_tokens: 1024
    });

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const parsedData = JSON.parse(responseData);
          if (parsedData.error) {
            reject(parsedData.error);
          } else if (parsedData.content && parsedData.content.length > 0) {
            resolve(parsedData.content[0].text);
          } else {
            resolve("No response from Claude.");
          }
        } catch (error) {
          reject(`Error parsing API response: ${error.message}`);
        }
      });
    });

    req.on('error', (error) => {
      reject(`API request error: ${error.message}`);
    });

    req.write(data);
    req.end();
  });
}

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Load the index.html of the app
  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true
  }));

  // Register a command+shift+d shortcut listener
  const ret = globalShortcut.register('CommandOrControl+Shift+D', async () => {
    const clipboardText = clipboard.readText();
    
    // Send the clipboard text to the renderer process
    mainWindow.webContents.send('clipboard-text', clipboardText);
    
    // Process with Anthropic Claude API if there's text
    if (clipboardText.trim()) {
      try {
        mainWindow.webContents.send('processing-status', 'Processing with Claude...');
        const claudeResponse = await callAnthropicAPI(clipboardText);
        
        // Copy Claude's response to clipboard
        clipboard.writeText(claudeResponse);
        
        // Send to renderer
        mainWindow.webContents.send('claude-response', claudeResponse);
        mainWindow.webContents.send('clipboard-status', 'Response copied to clipboard!');
      } catch (error) {
        console.error('Error calling Claude API:', error);
        mainWindow.webContents.send('claude-response', `Error: ${error.message || error}`);
      }
    }
  });

  if (!ret) {
    console.log('Shortcut registration failed');
  }

  // Open the DevTools during development (optional)
  // mainWindow.webContents.openDevTools();

  // Emitted when the window is closed
  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows
app.whenReady().then(createWindow);

// Quit when all windows are closed
app.on('window-all-closed', function () {
  // On macOS it's common for applications to stay open
  // until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
  // On macOS it's common to re-create a window when the
  // dock icon is clicked and there are no other windows open
  if (mainWindow === null) createWindow();
});

// Unregister all shortcuts when the app is about to quit
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
}); 