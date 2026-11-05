# Daymaker

A mobile-first tracker for work hours, estimated pay, expenses, and savings wishes. It uses a warm stone background, rounded dashboard cards, dark navigation, and a coral accent inspired by the supplied references.

## Run

Requires Node.js 22.13 or newer and npm 10.9 or newer.

```sh
npm ci
npm run preview
```

Open the printed local URL in a browser. To run the Electron desktop wrapper, use `npm start`. The responsive interface is designed to fit an iPhone-sized screen. This repository currently packages an Electron app; it does not include a native iOS / Xcode project.

## Tracker behavior

- Schedule shifts with a date, start and end time, note, and hourly rate. On the scheduled day, swipe or hold the orange arrow on Home or Work to finish a shift and adjust the actual hours or times. Missed shifts can be finished later from Work.
- Only completed shifts count toward work and pay totals; shifts saved before the completion feature remain completed. The calendar shows completed and scheduled days.
- New shifts use the hourly rate from Your settings and automatically suggest a 30-minute unpaid break when the shift is 6 hours or longer; shorter shifts keep the break blank. A manually entered or cleared break is preserved while you adjust the times. Adjust the break or check Paid to include it in paid hours. Existing shifts retain their recorded hours until edited.
- Break minutes and paid status can also be updated when finishing or editing a shift; dashboard, calendar, and pay estimates use the resulting paid hours.
- Home and Work show today’s unfinished shift with its completion slider, then show the next shift after today’s shifts are finished.
- Estimated pay uses each shift’s hourly rate and does not automatically add an overtime premium.
- Add expenses with a category and date.
- Save wishlist items with a target and the amount already saved.
- Dashboard totals show current-month pay and expenses, with an estimated take-home figure.
- Data is stored in local browser storage on the device. It is not synced to an account or backed up.

The default hourly rate is NOK 220 and can be changed from the settings button. No shifts, expenses, or wishlist entries are prefilled.


## Install on iPhone as a PWA

The app includes a web app manifest, Home Screen icons, and a service worker that caches the app shell for offline use. For iPhone installation, publish the `src` folder at an HTTPS address. Open that address in Safari, choose Share → Add to Home Screen, then add Daymaker. The `file://` preview is for viewing only; service workers need HTTPS or localhost.

For local development, run `npm run preview` and open the localhost address on your Mac. To install on an iPhone, deploy the `src` folder to an HTTPS static host and open that public address in Safari.


## Publish with GitHub Pages

GitHub Pages uses the GitHub Actions publishing source. The `Publish Daymaker` workflow in `.github/workflows/pages.yml` uploads `docs/` and publishes it on every push to `main`. It can also be started manually from the Actions tab.

After changing the app, copy the changed files from `src/` to `docs/`, update the service worker cache and asset versions, and push the changes. Wait for the `Publish Daymaker` workflow to succeed before checking the live app.
