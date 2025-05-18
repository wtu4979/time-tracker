# Time Tracker Chrome Extension

A sleek and modern Chrome extension that helps you track time spent on different websites. Built with a focus on user experience and clean design.

## Features

- 🕒 Real-time tracking of time spent on websites
- 🎯 Automatic tracking of active tabs
- 🔄 Continuous tracking across browser sessions
- 📊 Daily statistics tracking
- 🎨 Modern, clean UI with smooth animations
- 🔍 Favicon display for easy site recognition
- ↩️ Undo functionality for deleted sites
- 📱 Responsive and compact design
- 💾 Efficient local storage management

## Installation

1. Clone this repository:
```bash
git clone https://github.com/yourusername/time-tracker.git
```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" in the top right corner

4. Click "Load unpacked" and select the `time-tracker` directory

## Usage

- Click the extension icon to view your time tracking statistics
- Hover over site icons to see the full URL
- Click on a site's icon to switch to that tab
- Click the trash icon to remove a site (with 5-second undo window)
- Use "Clear All Data" to reset tracking
- Click "Report Bug / Suggest Feature" to provide feedback

## Development

The extension is built with vanilla JavaScript and uses Chrome's Storage API for data persistence. The UI is built with modern CSS, including smooth animations and transitions.

### Project Structure

```
time-tracker/
├── manifest.json        # Extension configuration
├── popup.html          # Main popup interface
├── popup.js            # Popup functionality
├── background.js       # Background tracking script
└── README.md          # Documentation
```

### Key Components

- **Background Script**: Handles continuous time tracking and tab management
- **Popup Interface**: Provides user interface for viewing and managing tracked time
- **Storage System**: Manages persistent data storage using Chrome's Storage API

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details. 