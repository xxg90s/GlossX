// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "GlossXCore",
    platforms: [
        .iOS(.v15),
        .macOS(.v12)
    ],
    products: [
        .library(name: "GlossXCore", targets: ["GlossXCore"])
    ],
    targets: [
        .target(name: "GlossXCore"),
        .testTarget(
            name: "GlossXCoreTests",
            dependencies: ["GlossXCore"],
            path: "Tests"
        )
    ]
)
