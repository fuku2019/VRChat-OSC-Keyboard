# VrcLiveIme notices (distribution review in progress)

VrcLiveIme derives from fuku2019/VRChat-OSC-Keyboard, baseline
97cdab49918e7fb178988cc29f8b1d146ed9cde2. The application's GPL-3.0 text is
in LICENSE. OpenVR's notice is in Openvr-LICENSE.txt. Electron bundles its own
LICENSE.electron.txt and LICENSES.chromium.html; retain these in installers/zip.

The helper stage includes unmodified license texts under THIRD_PARTY_LICENSES:

| Component | Source / revision | License text |
| --- | --- | --- |
| AzooKeyKanaKanjiConverter | https://github.com/azooKey/AzooKeyKanaKanjiConverter / helper/windows-dependencies.json | azookeykanakanjiconverter-LICENSE.txt (MIT) |
| AzooKey dictionary | https://github.com/azooKey/azooKey_dictionary_storage / helper/windows-dependencies.json | AzooKeyDictionary-LICENSE.txt (Apache-2.0) |
| llama.cpp CPU binaries | https://github.com/fkunn1326/llama.cpp / b4846, archive and DLL hashes pinned | llama.cpp-LICENSE.txt (MIT) |
| Jinja | https://github.com/johnmai-dev/Jinja / helper/Package.resolved | jinja-LICENSE.txt (MIT) |
| Swift Algorithms, Collections, Numerics | source URLs and revisions in helper/Package.resolved | respective LICENSE.txt copies (Apache-2.0 with Swift exception) |
| swift-tokenizers | https://github.com/ensan-hcl/swift-tokenizers / helper/Package.resolved | swift-tokenizers-LICENSE.txt (Apache-2.0) |

Copyright notices are retained verbatim in those files. The helper includes
local changes to the pinned AzooKey source in helper/patches. Manual GGUF model
weights are not bundled; repositories, revisions and hashes are in models/manifest.json.

This list is not a completed redistribution clearance. Swift runtime/transitive
binary notices and MSVC/OpenMP redistribution remain under review. In particular,
the pinned dictionary's README is TBW and does not establish its data provenance
or the absence of Mozc-derived entries. Removing this application's old Mozc
assets does not establish that the replacement data has no Mozc ancestry.
The stage therefore remains distributionReady=false. See docs/distribution.md.
