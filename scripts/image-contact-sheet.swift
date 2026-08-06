import AppKit
import Foundation

let arguments = CommandLine.arguments
guard arguments.count >= 3 else {
    FileHandle.standardError.write(Data("usage: image-contact-sheet OUTPUT INPUT...\n".utf8))
    exit(2)
}

let outputURL = URL(fileURLWithPath: arguments[1])
let inputURLs = arguments.dropFirst(2).map { URL(fileURLWithPath: $0) }
let tileSize = 220
let columns = 5
let rows = Int(ceil(Double(inputURLs.count) / Double(columns)))
let width = tileSize * columns
let height = tileSize * rows

guard let bitmap = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: width,
    pixelsHigh: height,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
) else {
    throw NSError(domain: "ImageContactSheet", code: 1, userInfo: [NSLocalizedDescriptionKey: "bitmap creation failed"])
}

NSGraphicsContext.saveGraphicsState()
guard let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
    throw NSError(domain: "ImageContactSheet", code: 2, userInfo: [NSLocalizedDescriptionKey: "graphics context creation failed"])
}
NSGraphicsContext.current = context
NSColor.white.setFill()
NSRect(x: 0, y: 0, width: width, height: height).fill()

for (index, url) in inputURLs.enumerated() {
    guard let image = NSImage(contentsOf: url), image.size.width > 0, image.size.height > 0 else {
        throw NSError(domain: "ImageContactSheet", code: 3, userInfo: [NSLocalizedDescriptionKey: "image load failed: \(url.path)"])
    }
    let scale = min(CGFloat(tileSize) / image.size.width, CGFloat(tileSize) / image.size.height)
    let drawWidth = image.size.width * scale
    let drawHeight = image.size.height * scale
    let column = index % columns
    let rowFromTop = index / columns
    let x = CGFloat(column * tileSize) + (CGFloat(tileSize) - drawWidth) / 2
    let y = CGFloat(height - ((rowFromTop + 1) * tileSize)) + (CGFloat(tileSize) - drawHeight) / 2
    image.draw(
        in: NSRect(x: x, y: y, width: drawWidth, height: drawHeight),
        from: .zero,
        operation: .copy,
        fraction: 1,
        respectFlipped: true,
        hints: [.interpolation: NSImageInterpolation.high]
    )
}
context.flushGraphics()
NSGraphicsContext.restoreGraphicsState()

guard let jpeg = bitmap.representation(using: .jpeg, properties: [.compressionFactor: 0.88]) else {
    throw NSError(domain: "ImageContactSheet", code: 4, userInfo: [NSLocalizedDescriptionKey: "jpeg encoding failed"])
}
try jpeg.write(to: outputURL, options: .atomic)
