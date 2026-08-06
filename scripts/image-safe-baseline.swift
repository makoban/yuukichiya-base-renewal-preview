import AppKit
import CoreImage
import Foundation
import Vision

guard CommandLine.arguments.count == 3 || CommandLine.arguments.count == 4 else {
    FileHandle.standardError.write(Data("usage: image-safe-baseline input output [background]\n".utf8))
    exit(2)
}

let inputURL = URL(fileURLWithPath: CommandLine.arguments[1])
let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])
let backgroundURL = CommandLine.arguments.count == 4 ? URL(fileURLWithPath: CommandLine.arguments[3]) : nil
guard let rawSource = CIImage(contentsOf: inputURL) else {
    FileHandle.standardError.write(Data("画像を読み込めません\n".utf8))
    exit(3)
}
let rawExtent = rawSource.extent
let source = rawSource.transformed(by: CGAffineTransform(translationX: -rawExtent.minX, y: -rawExtent.minY))

func maskCoverage(_ pixelBuffer: CVPixelBuffer) -> Double {
    guard CVPixelBufferGetPixelFormatType(pixelBuffer) == kCVPixelFormatType_OneComponent8 else { return 1.0 }
    CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }
    guard let baseAddress = CVPixelBufferGetBaseAddress(pixelBuffer) else { return 1.0 }
    let width = CVPixelBufferGetWidth(pixelBuffer)
    let height = CVPixelBufferGetHeight(pixelBuffer)
    let bytesPerRow = CVPixelBufferGetBytesPerRow(pixelBuffer)
    var total: UInt64 = 0
    for row in 0..<height {
        let pixels = baseAddress.advanced(by: row * bytesPerRow).assumingMemoryBound(to: UInt8.self)
        for column in 0..<width { total += UInt64(pixels[column]) }
    }
    return Double(total) / (255.0 * Double(width * height))
}

let controls = CIFilter(name: "CIColorControls")!
controls.setValue(source, forKey: kCIInputImageKey)
controls.setValue(0.006, forKey: kCIInputBrightnessKey)
controls.setValue(1.025, forKey: kCIInputContrastKey)
controls.setValue(1.015, forKey: kCIInputSaturationKey)

let sharpen = CIFilter(name: "CISharpenLuminance")!
sharpen.setValue(controls.outputImage!, forKey: kCIInputImageKey)
sharpen.setValue(0.22, forKey: kCIInputSharpnessKey)

var image = sharpen.outputImage!
var mode = "safe_baseline"
if let backgroundURL, let rawBackground = CIImage(contentsOf: backgroundURL) {
    do {
        let handler = VNImageRequestHandler(ciImage: source)
        let textRequest = VNRecognizeTextRequest()
        textRequest.recognitionLevel = .fast
        textRequest.usesLanguageCorrection = false
        let humanRequest = VNDetectHumanRectanglesRequest()
        let foregroundRequest = VNGenerateForegroundInstanceMaskRequest()
        try handler.perform([textRequest, humanRequest, foregroundRequest])

        let textRegions = textRequest.results ?? []
        let textArea = textRegions.reduce(0.0) { result, observation in
            result + Double(observation.boundingBox.width * observation.boundingBox.height)
        }
        let hasHuman = !(humanRequest.results ?? []).isEmpty
        if !hasHuman, textRegions.count <= 2, textArea < 0.035,
           let foreground = foregroundRequest.results?.first,
           !foreground.allInstances.isEmpty {
            let maskBuffer = try foreground.generateScaledMaskForImage(forInstances: foreground.allInstances, from: handler)
            let coverage = maskCoverage(maskBuffer)
            if coverage >= 0.10 {
                let mask = CIImage(cvPixelBuffer: maskBuffer)
                let sourceExtent = source.extent
                let backgroundExtent = rawBackground.extent
                let normalizedBackground = rawBackground.transformed(by: CGAffineTransform(
                    translationX: -backgroundExtent.minX,
                    y: -backgroundExtent.minY
                ))
                let backgroundScale = max(
                    sourceExtent.width / backgroundExtent.width,
                    sourceExtent.height / backgroundExtent.height
                )
                let scaledBackground = normalizedBackground.transformed(by: CGAffineTransform(
                    scaleX: backgroundScale,
                    y: backgroundScale
                ))
                let centeredBackground = scaledBackground.transformed(by: CGAffineTransform(
                    translationX: (sourceExtent.width - scaledBackground.extent.width) / 2,
                    y: (sourceExtent.height - scaledBackground.extent.height) / 2
                )).cropped(to: sourceExtent)
                let blend = CIFilter(name: "CIBlendWithMask")!
                blend.setValue(image, forKey: kCIInputImageKey)
                blend.setValue(centeredBackground, forKey: kCIInputBackgroundImageKey)
                blend.setValue(mask, forKey: kCIInputMaskImageKey)
                if let blended = blend.outputImage {
                    image = blended
                    mode = String(format: "store_background:%.4f", coverage)
                }
            }
        }
    } catch {
        mode = "safe_baseline"
    }
}
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
FileHandle.standardOutput.write(Data("\(mode)\n".utf8))
