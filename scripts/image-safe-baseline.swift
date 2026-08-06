import AppKit
import CoreImage
import Foundation

guard CommandLine.arguments.count == 3 else {
    FileHandle.standardError.write(Data("usage: image-safe-baseline input output\n".utf8))
    exit(2)
}

let inputURL = URL(fileURLWithPath: CommandLine.arguments[1])
let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])
guard let source = CIImage(contentsOf: inputURL) else {
    FileHandle.standardError.write(Data("画像を読み込めません\n".utf8))
    exit(3)
}

let controls = CIFilter(name: "CIColorControls")!
controls.setValue(source, forKey: kCIInputImageKey)
controls.setValue(0.006, forKey: kCIInputBrightnessKey)
controls.setValue(1.025, forKey: kCIInputContrastKey)
controls.setValue(1.015, forKey: kCIInputSaturationKey)

let sharpen = CIFilter(name: "CISharpenLuminance")!
sharpen.setValue(controls.outputImage!, forKey: kCIInputImageKey)
sharpen.setValue(0.22, forKey: kCIInputSharpnessKey)

let image = sharpen.outputImage!
let extent = image.extent
let dimension: CGFloat = 1024
let scale = min(dimension / extent.width, dimension / extent.height)
let normalized = image.transformed(by: CGAffineTransform(translationX: -extent.minX, y: -extent.minY))
let scaled = normalized.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
let scaledExtent = scaled.extent
let centered = scaled.transformed(by: CGAffineTransform(
    translationX: (dimension - scaledExtent.width) / 2,
    y: (dimension - scaledExtent.height) / 2
))
let canvas = CIImage(color: CIColor.white).cropped(to: CGRect(x: 0, y: 0, width: dimension, height: dimension))
let composited = centered.composited(over: canvas)

let context = CIContext(options: [.useSoftwareRenderer: false])
guard let cgImage = context.createCGImage(composited, from: canvas.extent) else {
    FileHandle.standardError.write(Data("画像を書き出せません\n".utf8))
    exit(4)
}
let bitmap = NSBitmapImageRep(cgImage: cgImage)
guard let data = bitmap.representation(using: .jpeg, properties: [.compressionFactor: 0.86]) else {
    FileHandle.standardError.write(Data("JPEGへ変換できません\n".utf8))
    exit(5)
}
try FileManager.default.createDirectory(at: outputURL.deletingLastPathComponent(), withIntermediateDirectories: true)
try data.write(to: outputURL, options: .atomic)
