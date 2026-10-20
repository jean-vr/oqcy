# oqcy — Open QCY

**English** · [Português (BR)](README.pt-BR.md)

An **open-source, unofficial** app for controlling **QCY** earbuds over Bluetooth, built with Expo + TypeScript.
It talks directly to the earbuds (BLE/GATT) to show battery levels and adjust noise control, equalizer,
buttons and other settings — no account, no cloud, no ads.

> **Status: experimental.** It was developed and tested on a single device, the **QCY HT05 ANC**, on Android.
> Other QCY models that use the same protocol may work partially, but **nothing has been validated on them**.
> See [Compatibility](#compatibility) and [How to help with other models](#how-to-help-with-other-models).

*Not affiliated with QCY.*

## Why it exists

The official QCY app works, but it has well-known connection problems: it sometimes takes a long time to connect,
sometimes fails to recognize earbuds the system has already connected, and the earbuds' status syncs slowly or
freezes. oqcy reimplements only the Bluetooth/configuration part, with an architecture designed to be fast and
predictable, and documents the protocol so that others can extend it.

## What works (on the HT05 ANC)

- Automatic connection, and reconnection when you take the earbuds out of the case.
- Battery for the left earbud, right earbud and case.
- Noise control: **Noise cancelling**, **Off**, **Ambient**, and the ANC scenes (Indoor, Daily commute, Noisy, Wind noise).
- **My sound effects**: equalizer presets (Default, Popular, Heavy bass, Rock, Soft).
- Earbud volume, game mode, in-ear detection, LED, sleep mode.
- Button mapping, earbud name, auto power-off, balance, firmware version.
- **Diagnostics** screen: a log of everything sent and received, probes to discover commands, and raw byte sending.

Controls **only appear if the earbuds respond to the corresponding command**, so different models show different
screens.

## Compatibility

| Item | Status |
| --- | --- |
| Android | Yes (needs a *development build*; BLE is native code and does not run in Expo Go) |
| iOS | Untested. The classic Bluetooth module is Android-only |
| Web | Runs against a **simulated earbud**, only to preview the interface |
| QCY HT05 ANC | Tested |
| Other QCY models | Untested. Command values (especially noise modes and EQ presets) **vary per model** |
| Earbuds with other chips/protocols | Out of scope (see [Limits](#limits)) |

## Installation and usage

Requirements: Node.js 24+ (≥ 24.11), JDK 17 and the Android SDK to build.

```bash
npm install
npm test                  # protocol + connection manager against a simulated earbud
npx expo start --web      # interface against the simulated earbud, no Bluetooth
npx expo run:android      # development build on the device (needs Metro)
```

Release APK, with the JavaScript bundled in (does not depend on Metro):

```bash
npx expo prebuild --platform android
cd android && ./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a
# output: android/app/build/outputs/apk/release/app-release.apk
```

Before opening the app, **pair the earbuds in Android's Bluetooth settings** (audio goes through the system's
Bluetooth; oqcy only handles the settings) and grant the Bluetooth permissions when the app asks.

> A debug build needs the Metro server. Without it, the app gets stuck on the splash screen
> (`Unable to load script`). Use the release build, or run `adb reverse tcp:8081 tcp:8081` with `npx expo start`.

## Architecture

```
src/protocol/   pure, no React Native: TLV framing, codecs, BLE advertisement parser, noise values, EQ presets  (tested)
src/transport/  Radio/Link interface; implementations using react-native-ble-plx and a simulated earbud (web/tests)
src/session/    EarbudSession (GATT, queue, optimistic actions) and ConnectionManager (state machine)             (tested)
src/classic/    wrapper for the Android native module (modules/oqcy-classic, Kotlin): classic Bluetooth events
src/app/        screens (expo-router)
tests/          test vectors with real bytes captured from the official app
```

### How the connection works

- **Connection race:** the app tries the last saved BLE address **and** runs a low-latency scan filtered by the
  classic MAC found in the advertisement. Whichever syncs first wins. Failures use exponential backoff with jitter.
- **Classic Bluetooth as a trigger:** the Kotlin module forwards `ACL/A2DP/HFP` events. Earbuds connected to the
  phone → the GATT connection starts right away. Earbuds left or went into the case → the session is dropped
  without waiting for a timeout.
- **State:** a snapshot arrives in a single read; after that the app requests only what is missing. Actions are
  *optimistic* (the UI changes immediately) and re-read the real value if the earbuds do not confirm. A watchdog
  detects "half-dead" connections.

### The QCY protocol (GATT, service `0000A001-…`)

| Characteristic | Use |
| --- | --- |
| `1001` | command writes, without response: `FF <len> (<cmd> <len> <data>)…` |
| `1002` | state notification/read, same framing (several TLVs per frame) |
| `0008` | battery `[L, R, case]`, bit 7 = charging |
| `0007` | firmware version L/R |
| `000D` | buttons, `[key, function]` pairs, no framing |
| `000B` | legacy equalizer: `[index, 10 × int8 gains]`, no framing |

To request a state: `FF 03 FE 01 <cmd>`. Command IDs are in [`src/protocol/constants.ts`](src/protocol/constants.ts).

The **BLE advertisement** (company ID `0x521C`/`0x522C`) already carries the model, battery levels and the
classic Bluetooth MAC ([`src/protocol/advert.ts`](src/protocol/advert.ts)), which links the earbuds paired in
Android to their BLE address.

### QCY HT05 ANC values

Noise control (command 12, `FF 03 0C 01 <value>`):

| Value | Effect |
| --- | --- |
| `0x02` | ANC off |
| `0x63` | ANC on |
| `0xA4` | Ambient (passthrough) |
| `0x41` `0x51` `0x61` `0x71` | ANC scenes: Indoor, Daily commute, Noisy, Wind noise (order inferred from the official app's screen) |

EQ presets (characteristic `000B`): see [`src/protocol/presets.ts`](src/protocol/presets.ts).
The "Classic" preset has not been captured yet.

How these values were obtained: HCI captures of the official app using the author's **own** earbuds, confirmed by
listening to the earbuds. None of it comes from QCY code or assets: the repository contains only protocol bytes
and original code.

## How to help with other models

The app has diagnostic tools for mapping new models without recompiling:

1. In **Diagnostics**, run **Discover commands** (lists the IDs the earbuds respond to) and use **Share log**
   (shows the model, the GATT characteristics and every packet sent/received).
2. To find values that cannot be guessed (noise modes, presets), capture the official app's traffic:
   enable *Developer options → Enable Bluetooth HCI snoop log*, turn Bluetooth off and on, use the official app
   changing **one** setting at a time with pauses, note the order, and extract `btsnoop_hci.log`
   (`adb bugreport`). The ATT packets written to `0x1001`/`0x000B` show the exact bytes.
3. Open an issue or PR with the model, the list of what you did and the bytes. If possible, add a test in
   `tests/` with the captured bytes.

## Limits

- Only the **QCY protocol family over GATT `A001`**. The official app also speaks other protocols (Jieli RCSP,
  Airoha, Realtek, Actions, SPP…) and performs firmware updates (OTA). None of that is here.
- No background service: it reconnects while the app is open or when it returns to the foreground.
- The preset EQ does not allow band-by-band editing (the frequencies of the 10 bands are not known).
- Some labels and units (such as auto power-off) come from constants in the official app and may vary per model.
- **Use at your own risk.** Sending unknown commands to earbuds may change their settings. Factory reset and
  clearing pairings are available, with confirmation, on the settings screen.

## Legal notice

oqcy is an independent project, **not affiliated with, endorsed by, or supported by QCY**. "QCY" and product names
are trademarks of their respective owners, used only to indicate compatibility. The protocol was worked out by
observing the traffic of the author's own earbuds and by analyzing the official app, **for interoperability
purposes** with a device the author owns. The repository does not include code, images or data from the official
app. If you are a rights holder and have an objection, please open an issue.

## License

MIT, see [`LICENSE`](LICENSE).
