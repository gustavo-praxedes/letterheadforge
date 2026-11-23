# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## 0.1.0 (2026-11-23)

### Funcionalidades

* add application shell, design tokens and svg renderer ([e4bd527](https://github.com/gustavo-praxedes/letterheadforge/commit/e4bd527b3f0ad69fb762d6a9f84f4c7becb4bab0))
* add central config, units, sheet layout and stroke patterns ([48fa11e](https://github.com/gustavo-praxedes/letterheadforge/commit/48fa11e50806d9c2e2034ef4a9d08f61793b7226))
* add colour maths for the picker ([cd954e4](https://github.com/gustavo-praxedes/letterheadforge/commit/cd954e45aa5e5a44725447ede61848bc1fb4b77c))
* add colour picker popover and stop the feedback loop ([2d322f1](https://github.com/gustavo-praxedes/letterheadforge/commit/2d322f17ba2264a6a50c4c1222b0a565379b0937))
* add editor store with tagged undo history ([cd243e0](https://github.com/gustavo-praxedes/letterheadforge/commit/cd243e03e513044c435645156446493ff414e305))
* add font catalogue, woff loader and fontsource manifest ([7386d4c](https://github.com/gustavo-praxedes/letterheadforge/commit/7386d4cd05083676d3ea9c253a6fb60b35b9b7b0))
* add keyboard shortcuts, toasts and the shortcut sheet ([20a13e3](https://github.com/gustavo-praxedes/letterheadforge/commit/20a13e37f3c898766302dd4e2e0f28d5caa02637))
* add layer operations for the layers panel ([ed8c497](https://github.com/gustavo-praxedes/letterheadforge/commit/ed8c4971067f598796ab7e40fdce9504bd8446fd))
* add numeric field rules and scope test discovery to tests/ ([49255c0](https://github.com/gustavo-praxedes/letterheadforge/commit/49255c00a923ff8f30b7a36866683beb0d236956))
* add object creation and text editing ([a4ca29f](https://github.com/gustavo-praxedes/letterheadforge/commit/a4ca29f4776c6a42c4f788209769cfae3c3f0a53))
* add page, margins and frame panels ([0a893a1](https://github.com/gustavo-praxedes/letterheadforge/commit/0a893a17f466997e45caeb686053712d0a29c836))
* add pointer geometry for the interactive preview ([8cc30e8](https://github.com/gustavo-praxedes/letterheadforge/commit/8cc30e8e2964c1a827e997f7c8f7ef94d55ac54a))
* add preset schema, migration and validation with tests ([438d033](https://github.com/gustavo-praxedes/letterheadforge/commit/438d03330e053f84946e52bb8d65adabadd2c70d))
* add ruling panel ([1405a51](https://github.com/gustavo-praxedes/letterheadforge/commit/1405a51d1f60fb542b49ea4c3b940fe7ea904348))
* add the interactive preview layer with selection and guides ([89a9eff](https://github.com/gustavo-praxedes/letterheadforge/commit/89a9effad5f024dee7909a410492d80585752a02))
* add the layers panel with inline rename ([61be736](https://github.com/gustavo-praxedes/letterheadforge/commit/61be7366c025554a0dc016a4fac10e4eca6473ca))
* add watermark panel ([bd06ce5](https://github.com/gustavo-praxedes/letterheadforge/commit/bd06ce59c63679fb058de488400c0efaf4ca0d11))
* close the spec gaps found in the compliance audit ([db6a7f6](https://github.com/gustavo-praxedes/letterheadforge/commit/db6a7f634cf6315e59d23e204c5e2610b878d872))
* give an unpositioned watermark the default geometry from the spec ([c14ff92](https://github.com/gustavo-praxedes/letterheadforge/commit/c14ff92de6e61b4d56dc8daf2f4a023ddd4fc87c))
* implement milestone 1 pure geometry core ([55333ee](https://github.com/gustavo-praxedes/letterheadforge/commit/55333ee7ddfcd04ae6719d12e294d0a681954deb))
* import images with the spec limits and save presets with ctrl+s ([a2ad04c](https://github.com/gustavo-praxedes/letterheadforge/commit/a2ad04c60ac71400d27e1b1c8682336e14757373))
* integrate draft persistence and autosave ([30ef108](https://github.com/gustavo-praxedes/letterheadforge/commit/30ef108f089a2d8f26d923e640b312d8c6b71506))
* integrate page, margins and frame panels ([079a93d](https://github.com/gustavo-praxedes/letterheadforge/commit/079a93d307666fda1c20920186182cc498fe3391))
* integrate the ruling panel ([b515bfe](https://github.com/gustavo-praxedes/letterheadforge/commit/b515bfe26e65b75d3b3c8c2ca5286cf99ea79a8f))
* integrate the watermark panel ([d230663](https://github.com/gustavo-praxedes/letterheadforge/commit/d230663ec44f87c804f0f1f379f95424be02d9c9))
* measure text with the loaded font so typed copy renders ([ef586bc](https://github.com/gustavo-praxedes/letterheadforge/commit/ef586bcc4e4f414daac49a3eee09a75de7297b36))
* persist draft, presets and images in indexeddb ([77f656f](https://github.com/gustavo-praxedes/letterheadforge/commit/77f656f0ce5890337b4d05599790fe82f0ce35a9))
* restore the draft on load and autosave changes ([5230f02](https://github.com/gustavo-praxedes/letterheadforge/commit/5230f02da4e0180d5dd7884582b01aaeb51e2203))
* wire the store and the configuration panels into the shell ([576570a](https://github.com/gustavo-praxedes/letterheadforge/commit/576570ae23e1952093d466d52106a836dc5b9b6c))

### Correções

* capture sections after the app mounts and keep mobile scrolling on the page ([0545478](https://github.com/gustavo-praxedes/letterheadforge/commit/0545478aee716ebabb8f454c88479296c44704f0))
* centre the sheet, raise the colour popover and style the dialog ([4af060f](https://github.com/gustavo-praxedes/letterheadforge/commit/4af060f343b28e2650fd2f898d841bdb4d37f67c))
* fit the sheet with measured pixels so the montage keeps its ratio ([1be0130](https://github.com/gustavo-praxedes/letterheadforge/commit/1be0130ac59cbf67678ca58eefa96e373844e191))
* give checkboxes a 44 px clickable row on touch screens ([e77694c](https://github.com/gustavo-praxedes/letterheadforge/commit/e77694ce9ea5cb3a9d1c036395f1f44c698e3dc4))
* keep the canvas overlay transparent so the scene renders ([295f83c](https://github.com/gustavo-praxedes/letterheadforge/commit/295f83c30bd799fa53add0b806263f17cac60b8b))
* keep the watermark inside its own page ([677c29e](https://github.com/gustavo-praxedes/letterheadforge/commit/677c29e46ecf5393becb027a4309959417007878))
* make the A4 montage read-only so no selection leaks between pages ([35f6943](https://github.com/gustavo-praxedes/letterheadforge/commit/35f694361e87ed10350fcbfc7788f5e05f61d777))
* stop the colour picker stealing focus on every pointerdown ([9da5875](https://github.com/gustavo-praxedes/letterheadforge/commit/9da58754e80b869ee9dc3f6964ebb05af4761071))

### Testes

* capture the frame and colour picker states ([31cb25f](https://github.com/gustavo-praxedes/letterheadforge/commit/31cb25f742290c7f7a36585f74ba131595c4e599))
* capture the watermark and the shortcut sheet ([14332e0](https://github.com/gustavo-praxedes/letterheadforge/commit/14332e041c9b5d70b08d7d063c18fa275e815640))
* cover config, units, layout and stroke patterns ([00068ac](https://github.com/gustavo-praxedes/letterheadforge/commit/00068acd46d7fde68a9cdc56683e449a0550bd71))

### Documentação

* add milestone 2 plan and update project state ([b513442](https://github.com/gustavo-praxedes/letterheadforge/commit/b5134426d7cf8e155566dafa863edb06f0279b27))
* adopt WOFF fonts and record milestone 1 approval ([bc3f580](https://github.com/gustavo-praxedes/letterheadforge/commit/bc3f580efa0cb603e5cfb8c8226c50ff82b9fbc1))
* record milestone 2 as complete ([bcbeb9a](https://github.com/gustavo-praxedes/letterheadforge/commit/bcbeb9a2d905f976352c74f6f07e422e7fd7d86e))
* record milestone 2 progress ([bcf815c](https://github.com/gustavo-praxedes/letterheadforge/commit/bcf815cbaed554c235d9724f5cda10dcd89a13dd))
* record the focus-stealing defect and milestone 2 progress ([c62a5ff](https://github.com/gustavo-praxedes/letterheadforge/commit/c62a5ff71c3e32be28bee9424e9cbd056eb51710))
* update milestone 2 progress ([76da29a](https://github.com/gustavo-praxedes/letterheadforge/commit/76da29a58da326c6ed0d23cf639581e7b5af5634))
* update milestone 2 progress ([17a1502](https://github.com/gustavo-praxedes/letterheadforge/commit/17a15020a4ae514ed2b63b642268655b6e2f1f5c))
