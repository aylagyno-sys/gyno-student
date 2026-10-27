# AYLA GYNO 1.0.1 — validation record

Validated on 27 October 2026. These are the normal offline Admin and Student editions. Version 1.0.1 adopts the owner's selected **concept 02 from the first logo proposal group**, including the maternal A app icon, internal wordmark, and transparent dark-theme wordmark. It is a new copy of the completed AYLA 1.0.0 application; the original release and supplied Adam ENT 1.2.7 input archives were not edited.

## Executed checks

- **Three automated taxonomy tests passed:** both supplied sections, all 70 numbered chapters and 17 source Parts retained; all 513 configured clinical topics appear in the empty-bank guide on their correct branches; Admin and Student ship identical curricula and guide logic.
- **32 actual Chrome browser checks passed:** genuine administrator unlock, JSON preview/confirmation, source-topic selection on an empty bank, canonical chapter-number/title matching, actual Export Update with an image, checksum verification, fresh Student import with three questions, separate role databases, rejection of foreign-bank and corrupted packages before writes, repeated stable-UID updates preserving local IDs and saved notes/bookmarks/performance/exam history, image rendering, search, unchanged pre-existing ENT storage, cache isolation, relative project-path assets, offline reload, mobile layout, and readable body text in dark mode. No uncaught browser errors or missing application assets were recorded.
- **19 logo checks passed in actual Chrome:** both editions retain their database names, storage prefixes and source taxonomy; six matching PNG assets have valid dimensions; all PNGs and the self-contained SVG alias decode under a project subpath. The selected light/dark wordmark has an accessible brand name and remains visible and contained at desktop, 390px mobile and 320px narrow widths. No uncaught rendering errors were recorded.
- **11 actual cached-upgrade checks passed:** a real 1.0.0 student installation, with its active service worker, imported the previous release's three-question package and image. After the server switched to 1.0.1, the new worker activated, the application was reopened at the exact same URL, and raw IndexedDB records were compared. Questions and local IDs, images, bookmarks, notes, performance, exam history and the localStorage progress namespace were preserved. The worker replaced the prior Student shell cache while preserving ENT and Admin caches. The new logo, shell and installed questions then opened offline without uncaught errors.
- **44 JavaScript syntax checks passed**, covering both editions' external scripts and inline script blocks.
- English, light/dark, desktop/mobile screenshots were visually inspected. Transparent raster masters were generated from the approved concept 02 reference; icon sizing, framing and the white dark-theme variant were prepared with browser canvas. The SVG alias embeds the PNG symbol and is not editable vector artwork. The logo archive includes the reference, masters and exact generation prompts.

The preceding 1.0.0 release also passed 25 focused package-flow assertions and 22 additional classification-guide assertions. Those are baseline results, not additional newly executed 1.0.1 checks. The current release reran the taxonomy and real-browser flows above. The browser harness explicitly awaits asynchronous conditions and finished Settings renders before interacting with controls.

The browser tests use synthetic interface questions and images. No clinical question bank is bundled or certified by these checks. Reusable tests remain in the development project's `tests/` directory; generated fixtures, logs, and browser profiles are excluded from the application ZIPs.

## Source classification handling

The supplied `AYLA_GYNO_Dewhurst_9e_Taxonomy.json` was treated as data. Its two Subjects are presented as **Obstetrics** and **Gynaecology**, with the original Section titles and 17 Part groups preserved as metadata. Chapter names retain their original numbers.

The source file contains 639 chapter headings. A specific list of 126 non-clinical headings (References, Summary, Conclusion(s), Further reading, acknowledgements, and website headings) is excluded from question-topic choices, leaving **513 topic entries across the 70 chapters**. General and Uncategorized are application fallbacks, not added source-book headings. The complete original source JSON is included unchanged in both editions for reference.

Subject, Chapter, and Topic are read from imported metadata. Known source aliases are matched deterministically. Unknown labels are preserved and flagged for review; the app does not infer medical categories from question prose. No source Subtopic hierarchy was invented.

## Delivery and practical limits

Each role ZIP places `index.html` and `.nojekyll` at its top level. Every archive entry is verified against its source SHA-256 and ZIP CRC after packaging. The final archive checksums are supplied separately. No test bank, temporary user data, browser profile, backend credential, payment integration, APK, or AAB is included.

The applications were tested under local HTTPS-compatible/loopback browser conditions and GitHub-style nested URL paths. They have **not** been published in the owner's GitHub account or tested as a native Android release, on a physical phone, or in Safari. Host through HTTPS or localhost; `file://` is not a complete PWA/offline test.

The Admin editing lock is local browser functionality, not server authentication. Each role's IndexedDB and localStorage are separate from the existing ENT application and from the other AYLA role. User progress stays on the current device/browser; cloud synchronization is not implemented.
