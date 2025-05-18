# Permission Justification for Trackly

## Required Permissions

### 1. `tabs` Permission
This permission is required to:
- Monitor which tabs are currently active
- Track time spent on each website
- Enable tab switching functionality when clicking on a site
- Detect when tabs are opened, closed, or become inactive
- Get the URL of the current tab for time tracking

Without this permission, the extension would not be able to:
- Know which website is currently being used
- Track time accurately
- Allow users to switch between tabs
- Maintain accurate active/inactive tab lists

### 2. `storage` Permission
This permission is required to:
- Save time tracking data locally
- Store user preferences (like dark/light mode setting)
- Maintain daily statistics
- Remember last visit times
- Enable data persistence between browser sessions

Without this permission, the extension would not be able to:
- Save any tracking data
- Remember user settings
- Show historical data
- Maintain accurate statistics

## Permission Usage Details

### How We Use These Permissions:
1. `tabs`:
   - Only accesses domain names, not page content
   - Used solely for time tracking purposes
   - No sensitive information is collected
   - No browsing history is stored

2. `storage`:
   - All data stays local on your device
   - No cloud storage or external servers
   - User has full control over data
   - Can be cleared at any time

### What We Don't Do:
- We don't access page content
- We don't store personal information
- We don't track browsing history
- We don't send data to external servers
- We don't use any analytics or tracking
- We don't request unnecessary permissions

## Privacy Considerations
- All data processing happens locally
- No external services are used
- User has complete control over their data
- Clear data option always available
- Transparent about all data usage 