import Foundation
import KanaKanjiConverterModule

// Isolated Gate A probe; not the production JSONL helper.
struct ProbeResult: Encodable {
    let requestedEngine: String
    let modelStatus: String
    let candidates: [String]
    let elapsedMs: Double
    let successfulDecodes: Int
    let failedDecodes: Int
    let modelLoadAttempts: Int
}

enum ProbeError: Error { case invalidArguments, missingDictionary, missingModel }

do {
    let args = Array(CommandLine.arguments.dropFirst())
    guard args.count == 2 || args.count == 3 else { throw ProbeError.invalidArguments }
    let dictionary = URL(fileURLWithPath: args[0], isDirectory: true)
    guard FileManager.default.fileExists(atPath: dictionary.appendingPathComponent("mm.binary").path),
          FileManager.default.fileExists(atPath: dictionary.appendingPathComponent("louds/charID.chid").path)
    else { throw ProbeError.missingDictionary }
    let model = args.count == 3 ? URL(fileURLWithPath: args[2]) : nil
    if let model, !FileManager.default.fileExists(atPath: model.path) { throw ProbeError.missingModel }
    let converter = KanaKanjiConverter(dictionaryURL: dictionary)
    var composing = ComposingText()
    composing.insertAtCursorPosition(args[1], inputStyle: .direct)
    let options = ConvertRequestOptions(
        N_best: 10,
        requireJapanesePrediction: .disabled,
        requireEnglishPrediction: .disabled,
        keyboardLanguage: .ja_JP,
        learningType: .nothing,
        maxMemoryCount: 0,
        memoryDirectoryURL: dictionary,
        sharedContainerURL: dictionary,
        textReplacer: TextReplacer(emojiDataProvider: { dictionary.appendingPathComponent("unused-emoji.txt") }),
        specialCandidateProviders: [],
        zenzaiMode: model.map { .on(weight: $0, inferenceLimit: 1,
            requestRichCandidates: false, personalizationMode: nil) } ?? .off,
        metadata: nil
    )
    let start = ContinuousClock.now
    let result = converter.requestCandidates(composing, options: options)
    let elapsed = start.duration(to: .now).components
    let output = ProbeResult(requestedEngine: model == nil ? "azookey" : "zenzai",
        modelStatus: converter.zenzStatus,
        candidates: result.mainResults.filter {
            $0.composingCount == .inputCount(composing.input.count) ||
            $0.composingCount == .surfaceCount(composing.convertTarget.count)
        }.prefix(20).map(\.text),
        elapsedMs: Double(elapsed.seconds) * 1000 + Double(elapsed.attoseconds) / 1e15,
        successfulDecodes: converter.zenzaiDiagnostics.successfulDecodes,
        failedDecodes: converter.zenzaiDiagnostics.failedDecodes,
        modelLoadAttempts: converter.zenzaiModelLoadAttempts)
    FileHandle.standardOutput.write(try JSONEncoder().encode(output))
    FileHandle.standardOutput.write(Data([10]))
} catch {
    FileHandle.standardError.write(Data("Probe failed: \(error)\nUsage: ZenzaiProbe <dictionary> <kana> [model.gguf]\n".utf8))
    exit(1)
}
