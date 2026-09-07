# Bundled dependencies

The app is served entirely from `dist/`. It makes no runtime CDN requests.

| Component | Version | Source | License |
| --- | --- | --- | --- |
| Three.js | 0.180.0 | https://github.com/mrdoob/three.js/tree/r180 | `dist/vendor/THREE-LICENSE.txt` (MIT) |
| meshoptimizer simplifier | 0.25 | https://github.com/zeux/meshoptimizer/tree/v0.25/js | `dist/vendor/MESHOPT-LICENSE.txt` (MIT) |

The original `meshopt_simplifier.module.js` is bundled without modifications. Its SHA-256 is `c1d23d1a1ead1251def1f98fa427b6e61d9e6f53ff32e69aaf7159d502cd77ca`. The module embeds its WebAssembly payload; it does not download a separate binary at runtime.

The supplied inspiration image remains a user-provided reference. No additional image rights are asserted. Optional report generation uses Matplotlib; it is not bundled or required for the studio.


## Movie encoder and dataset archives

| Component | Version / source | License |
| --- | --- | --- |
| h264-mp4-encoder | 1.0.12, [source at 6d177fd](https://github.com/TrevorSundberg/h264-mp4-encoder/tree/6d177fd043157606224cef4702e134dd31f6adfa) | MIT, `dist/vendor/H264-MP4-LICENSE.txt` |
| libmp4v2, embedded in that encoder | [fork at d49b446](https://github.com/TrevorSundberg/libmp4v2/tree/d49b4466ed76fc23b59e31a5f7f10f34b30ad7c4) | MPL 1.1, `dist/vendor/LIBMP4V2-LICENSE.txt` |
| minih264, embedded in that encoder | [fork at 25f4410](https://github.com/TrevorSundberg/minih264/tree/25f441086ac8f2eef1c883476c095f9397843ac8) | CC0 1.0, `dist/vendor/MINIH264-LICENSE.txt` |
| fflate | 0.8.3, [upstream](https://github.com/101arrowz/fflate) | MIT, `dist/vendor/FFLATE-LICENSE.txt` |
| fake-indexeddb, unit tests only | 6.2.2, [upstream](https://github.com/dumbmatter/fakeIndexedDB) | Apache 2.0, `tests/vendor/fake-indexeddb/LICENSE` |

`dist/vendor/h264-mp4-encoder.js` is the unmodified web bundle from the npm 1.0.12 package, renamed from `h264-mp4-encoder.web.js`. SHA-256: `db5e45cc1367dc467f876944d9b16eb30f8e984384587c8c00f8d973aff68ce7`. It embeds its WebAssembly binary; runtime encoding is entirely local.

Corresponding encoder wrapper and libmp4v2 source archives are included in `third_party/source/` at the exact package gitHead and submodule commits. The minih264 source archive includes its source, build/test scripts, and license; bulky reference video vectors and README images are omitted. No source code was modified. The MPL-covered libmp4v2 fork and its upstream modifications remain available in source form under that license, separately from the app's MIT-licensed code.

`dist/vendor/fflate.js` is the unmodified `esm/browser.js` from npm 0.8.3. SHA-256: `b7ca4450b19559a1d50eb381adcee94b82449674be4cd17789d9beba7e6122a1`. It is used for streaming ZIP compression and dataset import. The fake-indexeddb ESM build is included solely so the IndexedDB unit tests can run locally without npm installation; it is never shipped in the public app output or loaded in the studio.
