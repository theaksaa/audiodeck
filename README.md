# AudioDeck

Local Node.js web app for controlling Windows audio over your LAN.

## MVP

- Read master volume
- Change master volume
- Mute and unmute the host machine

## Run

```powershell
npm.cmd start
```

Then open `http://localhost:3000` or `http://YOUR-LAN-IP:3000`.

When the server starts it will also print the detected LAN URLs in the console.

## MAC whitelist

Edit [config/whitelist.json](c:/Users/aksaa/Documents/Projects/audiodeck/config/whitelist.json#L1):

```json
{
  "enabled": true,
  "allowedMacs": [
    "AA-BB-CC-DD-EE-FF",
    "11-22-33-44-55-66"
  ]
}
```

Notes:

- `localhost` is always allowed
- MAC addresses are matched case-insensitively
- The server resolves a device MAC from its LAN IP using Windows neighbor lookup
- If Windows cannot resolve the MAC, access is denied when whitelist mode is enabled

## Notes

This first version uses a PowerShell script with Windows Core Audio APIs for master volume control. Future milestones can add:

- login/auth
- device whitelist
- per-app volume
- default output device switching
- Equalizer APO integration and preset storage
