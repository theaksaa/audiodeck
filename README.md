# AudioDeck

Local Node.js web app for controlling Windows audio over your LAN.

## MVP

- Read master volume
- Change master volume
- Mute and unmute the host machine

## Run

```powershell
npm start
```

Then open `http://localhost:3000` or `http://YOUR-LAN-IP:3000`.

## Notes

This first version uses a PowerShell script with Windows Core Audio APIs for master volume control. Future milestones can add:

- login/auth
- device whitelist
- per-app volume
- default output device switching
- Equalizer APO integration and preset storage
