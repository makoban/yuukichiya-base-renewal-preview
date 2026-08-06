import AppKit
import CoreImage
import Foundation
import Vision

struct InputManifest: Decodable {
    struct Product: Decodable {
        struct Image: Decodable { let imageNo: Int }
        let itemId: String
        let images: [Image]
    }
    let products: [Product]
}

guard CommandLine.arguments.count == 4 else {
    FileHandle.standardError.write(Data("usage: classify-image-review-input manifest.json originals-root output.jsonl\n".utf8))
    exit(2)
}

let manifestURL = URL(fileURLWithPath: CommandLine.arguments[1])
let originalsRoot = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
let outputURL = URL(fileURLWithPath: CommandLine.arguments[3])
let decoder = JSONDecoder()
let manifest = try decoder.decode(InputManifest.self, from: Data(contentsOf: manifestURL))
FileManager.default.createFile(atPath: outputURL.path, contents: nil)
let output = try FileHandle(forWritingTo: outputURL)
defer { try? output.close() }

let total = manifest.products.reduce(0) { $0 + $1.images.count }
var completed = 0

for product in manifest.products {
    for image in product.images {
        autoreleasepool {
            let filename = String(format: "%02d.jpg", image.imageNo)
            let fileURL = originalsRoot
                .appendingPathComponent(product.itemId, isDirectory: true)
                .appendingPathComponent(filename)
            var result: [String: Any] = [
                "itemId": product.itemId,
                "imageNo": image.imageNo,
                "path": fileURL.path,
                "textRegionCount": 0,
                "textArea": 0.0,
                "maxTextArea": 0.0,
                "hasHuman": false,
                "classification": "product_photo",
            ]
            do {
                guard let source = CIImage(contentsOf: fileURL) else {
                    throw NSError(domain: "YuukichiyaImageClassifier", code: 1,
                                  userInfo: [NSLocalizedDescriptionKey: "画像を読み込めません"])
                }
                let textRequest = VNRecognizeTextRequest()
                textRequest.recognitionLevel = .fast
                textRequest.usesLanguageCorrection = false
                let humanRequest = VNDetectHumanRectanglesRequest()
                let handler = VNImageRequestHandler(ciImage: source)
                try handler.perform([textRequest, humanRequest])
                let textRegions = textRequest.results ?? []
                let areas = textRegions.map { Double($0.boundingBox.width * $0.boundingBox.height) }
                let textArea = areas.reduce(0, +)
                let maxTextArea = areas.max() ?? 0
                let textCount = textRegions.count
                let hasHuman = !(humanRequest.results ?? []).isEmpty

                // サイズ表・カタログ紙面・説明資料を保守的に除外する。
                // 商品ロゴ1〜数個だけの写真は商品写真として残す。
                let isTextDocument = textArea >= 0.12
                    || textCount >= 18
                    || (textCount >= 8 && textArea >= 0.045)
                result["textRegionCount"] = textCount
                result["textArea"] = textArea
                result["maxTextArea"] = maxTextArea
                result["hasHuman"] = hasHuman
                result["classification"] = isTextDocument ? "text_document" : "product_photo"
            } catch {
                result["classification"] = "classification_error"
                result["error"] = error.localizedDescription
            }
            let data = try! JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
            output.write(data)
            output.write(Data("\n".utf8))
            completed += 1
            if completed % 50 == 0 || completed == total {
                FileHandle.standardError.write(Data("classified \(completed)/\(total)\n".utf8))
            }
        }
    }
}
