# Sticky Trello Widget

A powerful, transparent Trello widget for Windows that integrates seamlessly with your desktop wallpaper.

## Features

- **Transparent Background:** The Trello board background is made transparent, allowing your wallpaper to show through while keeping cards and lists clearly visible.
- **Glassmorphism Design:** Modern UI with subtle blur and glass-like effects.
- **Always on Top:** Option to keep the widget above other windows.
- **System Tray Integration:** Easily control the widget from the Windows system tray.
- **Customizable:** Settings persist across sessions.

## Prerequisites

- [Node.js](https://nodejs.org/) (Recommended version: 18.x or 20.x)
- Trello Account

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/73rdwolf/sticky-trello-widget.git
   cd sticky-trello-widget
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Running the App

You can start the widget using the provided batch file or via npm:

- **Using batch file:** Double-click `run.bat`
- **Using npm:**
  ```bash
  npm start
  ```

## Usage

- **Transparency:** The widget automatically applies transparency to the Trello board.
- **Drag & Resize:** Use standard Windows interactions to position the widget on your desktop.
- **Tray Menu:** Right-click the Trello icon in the system tray to access settings like "Always on Top" or to "Quit" the application.

## Development

The app is built with:
- **Electron:** For the desktop environment.
- **HTML/CSS/JS:** Vanilla web technologies for the UI and logic.

## License

MIT
