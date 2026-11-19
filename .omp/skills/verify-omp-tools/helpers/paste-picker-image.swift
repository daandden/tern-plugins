import AppKit
import CryptoKit
import Foundation

struct ProbeError: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}

struct Representation: Equatable {
    let type: NSPasteboard.PasteboardType
    let bytes: Data
}

typealias Clipboard = [[Representation]]

func snapshot(_ clipboard: NSPasteboard) throws -> Clipboard {
    guard let items = clipboard.pasteboardItems else {
        guard clipboard.types?.isEmpty != false else { throw ProbeError("Cannot enumerate clipboard items") }
        return []
    }
    return try items.map { item in
        guard !item.types.isEmpty else { throw ProbeError("Cannot enumerate an item's types") }
        return try item.types.map { type in
            guard let bytes = item.data(forType: type) else {
                throw ProbeError("Cannot read clipboard type \(type.rawValue); clipboard not replaced")
            }
            return Representation(type: type, bytes: bytes)
        }
    }
}

func describe(_ items: Clipboard, phase: String) throws {
    let descriptions: [[String: Any]] = items.map { item in
        var hash = SHA256()
        func add(_ bytes: Data) {
            var size = UInt64(bytes.count).bigEndian
            withUnsafeBytes(of: &size) { hash.update(bufferPointer: $0) }
            hash.update(data: bytes)
        }
        for representation in item {
            add(Data(representation.type.rawValue.utf8))
            add(representation.bytes)
        }
        return ["types": item.map { $0.type.rawValue }, "sha256": hash.finalize().map { String(format: "%02x", $0) }.joined()]
    }
    let data = try JSONSerialization.data(withJSONObject: ["phase": phase, "itemCount": items.count, "items": descriptions], options: .sortedKeys)
    print(String(decoding: data, as: UTF8.self))
}

func pasteboardItems(_ contents: Clipboard) throws -> [NSPasteboardItem] {
    try contents.map { item in
        let object = NSPasteboardItem()
        for representation in item {
            guard object.setData(representation.bytes, forType: representation.type) else {
                throw ProbeError("Could not prepare clipboard type \(representation.type.rawValue)")
            }
        }
        return object
    }
}

func makeImage() throws -> Data {
    guard let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 16, pixelsHigh: 16,
            bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
            bytesPerRow: 0, bitsPerPixel: 0) else { throw ProbeError("Could not allocate bitmap") }
    for y in 0..<16 {
        for x in 0..<16 {
            let blue = (x < 8) == (y < 8)
            bitmap.setColor(NSColor(deviceRed: blue ? 0 : 1, green: 0, blue: blue ? 1 : 0, alpha: 1), atX: x, y: y)
        }
    }
    guard let data = bitmap.representation(using: .png, properties: [:]) else { throw ProbeError("Could not encode PNG") }
    return data
}

func run() throws {
    guard CommandLine.arguments.count == 3 else { throw ProbeError("Usage: swift paste-picker-image.swift TERN_VERIFY RUN") }
    let launcher = URL(fileURLWithPath: CommandLine.arguments[1])
    let run = CommandLine.arguments[2]
    let runURL = URL(fileURLWithPath: run, isDirectory: true)
    guard try String(contentsOf: runURL.appendingPathComponent("instance/profile"), encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines) == "omp-tools",
          try String(contentsOf: runURL.appendingPathComponent("instance/mode"), encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines) == "window" else {
        throw ProbeError("Expected an isolated native omp-tools window")
    }

    func ctl(_ arguments: [String]) throws -> Data {
        let process = Process()
        process.executableURL = launcher
        process.arguments = ["ctl", run] + arguments
        let pipe = Pipe()
        process.standardOutput = pipe
        try process.run()
        let output = pipe.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        guard process.terminationStatus == 0 else { throw ProbeError("tern-verify ctl failed") }
        return output
    }

    func textNodes(_ value: Any) -> [String] {
        if let object = value as? [String: Any] {
            return (object["text"] as? String).map { [$0] } ?? object.values.flatMap(textNodes)
        }
        if let list = value as? [Any] { return list.flatMap(textNodes) }
        return []
    }

    func hasChip(_ texts: [String]) -> Bool {
        texts.contains("#1")
    }

    let start = textNodes(try JSONSerialization.jsonObject(with: ctl(["tree"])))
    guard start.contains(where: { $0.hasPrefix("Note for ") }), !hasChip(start) else {
        throw ProbeError("Focus an empty Picker note editor before pasting")
    }
    let png = try makeImage()
    try png.write(to: runURL.appendingPathComponent("clipboard-fixture.png"))
    let image = try pasteboardItems([[Representation(type: .png, bytes: png)]])
    let clipboard = NSPasteboard.general
    let originalCount = clipboard.changeCount
    let original = try snapshot(clipboard)
    let restoreItems = try pasteboardItems(original)
    guard clipboard.changeCount == originalCount else {
        throw ProbeError("Clipboard changed during snapshot (\(originalCount) → \(clipboard.changeCount)); clipboard not replaced")
    }

    clipboard.clearContents()
    let wroteImage = clipboard.writeObjects(image)
    let ownCount = clipboard.changeCount
    var capture: Data?
    var pasteError: Error?
    do {
        guard wroteImage else { throw ProbeError("Could not write PNG to clipboard") }
        guard clipboard.changeCount == ownCount else { throw ProbeError("Clipboard changed before Cmd+V") }
        _ = try ctl(["key", "cmd+v"])
        let deadline = Date().addingTimeInterval(3)
        while Date() < deadline, clipboard.changeCount == ownCount {
            let tree = try ctl(["tree"])
            if hasChip(textNodes(try JSONSerialization.jsonObject(with: tree))) {
                capture = tree
                break
            }
            Thread.sleep(forTimeInterval: 0.05)
        }
    } catch { pasteError = error }

    let currentCount = clipboard.changeCount
    guard currentCount == ownCount else {
        throw ProbeError("Clipboard changed after fixture write (\(ownCount) → \(currentCount)); skipped restore")
    }
    clipboard.clearContents()
    guard restoreItems.isEmpty || clipboard.writeObjects(restoreItems) else { throw ProbeError("Clipboard restore write failed") }
    let restored = try snapshot(clipboard)
    try describe(original, phase: "before")
    try describe(restored, phase: "after")
    guard restored == original else { throw ProbeError("Restored clipboard does not match") }
    print("Clipboard restored: all items, types, and bytes match (fixture changeCount: \(ownCount))")
    if let pasteError { throw pasteError }
    guard let capture else { throw ProbeError("No image chip appeared after Cmd+V") }
    try capture.write(to: runURL.appendingPathComponent("note-chip.json"))
    print("Image chip observed after pasting the generated 16 x 16 public.png")
}

do {
    try run()
} catch {
    FileHandle.standardError.write(Data("\(error)\n".utf8))
    exit(1)
}
