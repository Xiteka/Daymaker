# Daymark

A mobile-first tracker for work hours, estimated pay, expenses, and savings wishes. It uses a warm stone background, rounded dashboard cards, dark navigation, and a coral accent inspired by the supplied references.

## Run

Requires Node.js 22.13 or newer and npm 10.9 or newer.

```sh
npm ci
npm run preview
```

Open the printed local URL in a browser. To run the Electron desktop wrapper, use `npm start`. The responsive interface is designed to fit an iPhone-sized screen. This repository currently packages an Electron app; it does not include a native iOS / Xcode project.

## Tracker behavior

- Log work shifts with a date, hours, optional note, and hourly pay. New shifts use the saved default hourly rate.
- Add expenses with a category and date.
- Save wishlist items with a target and the amount already saved.
- Dashboard totals show current-month pay and expenses, with an estimated take-home figure.
- Data is stored in local browser storage on the device. It is not synced to an account or backed up.

The default hourly rate is NOK 220 and can be changed from the settings button. No shifts, expenses, or wishlist entries are prefilled.


## Install on iPhone as a PWA

The app includes a web app manifest, Home Screen icons, and a service worker that caches the app shell for offline use. For iPhone installation, publish the `src` folder at an HTTPS address. Open that address in Safari, choose Share → Add to Home Screen, then add Daymark. The `file://` preview is for viewing only; service workers need HTTPS or localhost.

For local development, run `npm run preview` and open the localhost address on your Mac. To install on an iPhone, deploy the `src` folder to an HTTPS static host and open that public address in Safari.
