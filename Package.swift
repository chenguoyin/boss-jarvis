// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "boss-jarvis",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(name: "boss-jarvis", targets: ["BossJarvis"])
    ],
    targets: [
        .executableTarget(
            name: "BossJarvis",
            path: "Sources/BossJarvis"
        ),
        .testTarget(
            name: "BossJarvisTests",
            dependencies: ["BossJarvis"],
            path: "Tests/BossJarvisTests"
        )
    ]
)
