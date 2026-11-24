# reactionapp.life

Static site for Reaction App, a web prototype. Plain HTML, CSS, and JavaScript, with no build step. Made for GitHub Pages (the `CNAME` file holds `reactionapp.life`).

## Files

- `index.html`, `site.css`, `site.js`: landing page
- `app/`: the prototype (connect accounts, record session, highlight reel, finish options, demo wall, leaders, messages, profile)
- `designs.css`, `designs.js`: five designs and the design picker (bottom right). Switch with `?design=N`, N from 1 to 5. Design 1, Playful Pink, is the default
- `face.svg`, `app/icons/`, `app/manifest.webmanifest`: icons and manifest

## What works

- Desktop: `getDisplayMedia` (screen or tab) plus `getUserMedia` (camera), both recorded with `MediaRecorder`, offset by start time, previewed side by side. 5 minute timer that never cuts the session off.
- Phones: no `getDisplayMedia`, so the app says screen recording needs the coming phone app, and still records a camera reaction to a video picked from the device.
- Highlight reel: frame-difference motion on the camera track, about 4 samples per second, top peaks with 2 seconds before and after, each moment can be kept or dropped.
- Finish: post to wall (demo note on this device), save files to your computer, send to a friend (share sheet, else copy link text).
- Connect your accounts: each platform opens its official site in a new tab and is marked "opened" in localStorage. There is no OAuth, because a web page cannot log in to those apps for the user.

## Demo or planned

Community wall, leaders wall, messages, and profile use example placeholders and localStorage only. Sending a video to a friend, a smarter reaction model, storage, and accounts need a server and are planned.

## Run locally

`python3 -m http.server 8000`, then open `http://localhost:8000/`. Camera and screen capture need `localhost` or https.
