// swift-tools-version: 6.1
import PackageDescription

let package = Package(
    name: "VrcLiveImeHelper",
    products: [
        .executable(name: "ZenzaiProbe", targets: ["ZenzaiProbe"]),
        .executable(name: "ZenzaiHelper", targets: ["ZenzaiHelper"])
    ],
    dependencies: [
        .package(
            url: "https://github.com/azooKey/AzooKeyKanaKanjiConverter",
            revision: "d59a28e4c7ca049aef04f29a91eae9677a7753f2",
            traits: ["ZenzaiCPU"]
        )
    ],
    targets: [
        .executableTarget(
            name: "ZenzaiProbe",
            dependencies: [.product(name: "KanaKanjiConverterModule", package: "AzooKeyKanaKanjiConverter")],
            swiftSettings: [.interoperabilityMode(.Cxx)]
        ),
        .executableTarget(
            name: "ZenzaiHelper",
            dependencies: [.product(name: "KanaKanjiConverterModule", package: "AzooKeyKanaKanjiConverter")],
            swiftSettings: [.interoperabilityMode(.Cxx)]
        )
    ]
)
