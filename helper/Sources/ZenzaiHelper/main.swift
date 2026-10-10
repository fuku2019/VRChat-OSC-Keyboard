import Dispatch
import Foundation
import KanaKanjiConverterModule
import WinSDK

struct Request: Decodable, Sendable {
    let v: Int
    let type: String
    let id: Int
    let sessionId: String?
    let revision: Int?
    let text: String?
    let leftContext: String?
}

struct CandidateText: Encodable { let text: String }
struct Response: Encodable {
    var v = 1
    let type: String
    var id: Int?
    var sessionId: String?
    var revision: Int?
    var engine: String?
    var reason: String?
    var candidates: [CandidateText]?
    var elapsedMs: Double?
    var code: String?
}

enum HelperError: Error { case arguments, dictionaryMissing, invalidRequest, sessionLimit }

func emit(_ message: Response) {
    do {
        let data = try JSONEncoder().encode(message)
        try FileHandle.standardOutput.write(contentsOf: data + Data([10]))
    } catch { exit(1) }
}

func log(_ message: String) {
    FileHandle.standardError.write(Data((message + "\n").utf8))
}

// This object is transferred to a single serial worker queue after construction.
// The stdin reader never accesses converter state, including during reset/EOF.
final class Worker: @unchecked Sendable {
    private let converter: KanaKanjiConverter
    private let dictionary: URL
    private let model: URL?
    private var useModel = false
    private var sessions: [String: KanaKanjiConverter.ConversionSessionID] = [:]
    private var reason: String?

    init(dictionary: URL, model: URL?) throws {
        for name in ["mm.binary", "louds/charID.chid"] {
            guard FileManager.default.fileExists(atPath: dictionary.appendingPathComponent(name).path) else {
                throw HelperError.dictionaryMissing
            }
        }
        self.dictionary = dictionary
        self.model = model
        self.converter = KanaKanjiConverter(dictionaryURL: dictionary)
    }

    private func options(leftContext: String, neural: Bool) -> ConvertRequestOptions {
        ConvertRequestOptions(
            N_best: 10, requireJapanesePrediction: .disabled,
            requireEnglishPrediction: .disabled, keyboardLanguage: .ja_JP,
            learningType: .nothing, maxMemoryCount: 0,
            memoryDirectoryURL: dictionary, sharedContainerURL: dictionary,
            textReplacer: TextReplacer(emojiDataProvider: { self.dictionary.appendingPathComponent("unused-emoji.txt") }),
            specialCandidateProviders: [],
            zenzaiMode: neural ? model.map {
                .on(weight: $0, inferenceLimit: 1, requestRichCandidates: false,
                    personalizationMode: nil, versionDependentMode: .v3(.init(leftSideContext: leftContext)))
            } ?? .off : .off,
            metadata: nil
        )
    }

    func ready() {
        if let model, FileManager.default.fileExists(atPath: model.path) {
            var text = ComposingText()
            text.insertAtCursorPosition("あ", inputStyle: .direct)
            _ = converter.requestCandidates(text, options: options(leftContext: "", neural: true))
            useModel = converter.zenzStatus == "load \(model.absoluteString)" &&
                converter.zenzaiDiagnostics.successfulDecodes > 0 && converter.zenzaiDiagnostics.failedDecodes == 0
            reason = useModel ? nil : "model-inference-unavailable"
            converter.stopComposition()
        } else { reason = "model-unavailable" }
        diagnostics()
        emit(Response(type: "ready", engine: useModel ? "zenzai" : "azookey", reason: reason))
    }

    private func diagnostics() {
        let stats = converter.zenzaiDiagnostics
        log("{\"imeDiagnostics\":{\"successfulDecodes\":\(stats.successfulDecodes),\"failedDecodes\":\(stats.failedDecodes),\"modelLoadAttempts\":\(converter.zenzaiModelLoadAttempts)}}")
    }

    func handle(_ request: Request) {
        do {
            guard request.v == 1, request.id >= 0, request.id <= 9_007_199_254_740_991 else {
                throw HelperError.invalidRequest
            }
            if request.type == "shutdown" { exit(0) }
            guard let session = request.sessionId, !session.isEmpty, session.utf16.count <= 128 else {
                throw HelperError.invalidRequest
            }
            if request.type == "reset" {
                if let key = sessions.removeValue(forKey: session) {
                    try converter.withSession(key) { converter.stopComposition() }
                    converter.removeSession(key)
                }
                emit(Response(type: "reset", id: request.id, sessionId: session))
                return
            }
            guard request.type == "convert", let revision = request.revision, revision >= 0,
                  revision <= 9_007_199_254_740_991, let reading = request.text,
                  reading.utf16.count <= 4096, (request.leftContext ?? "").utf16.count <= 4096 else {
                throw HelperError.invalidRequest
            }
            if sessions[session] == nil {
                guard sessions.count < 32 else { throw HelperError.sessionLimit }
                sessions[session] = converter.createSession()
            }
            let key = sessions[session]!
            let start = ContinuousClock.now
            var composition = ComposingText()
            composition.insertAtCursorPosition(reading, inputStyle: .direct)
            let failuresBefore = converter.zenzaiDiagnostics.failedDecodes
            var result = try converter.withSession(key) {
                converter.requestCandidates(composition, options: options(leftContext: request.leftContext ?? "", neural: useModel))
            }
            var engine = useModel ? "zenzai" : "azookey"
            var responseReason = reason
            if useModel && converter.zenzaiDiagnostics.failedDecodes > failuresBefore {
                // A failed evaluation can return a conventional lattice internally.
                // Explicitly recompute without Zenzai and report the fallback.
                responseReason = "inference-failed"
                engine = "azookey"
                result = try converter.withSession(key) {
                    converter.stopComposition()
                    return converter.requestCandidates(composition, options: options(leftContext: "", neural: false))
                }
            }
            var seen = Set<String>()
            var texts = result.mainResults.filter {
                $0.composingCount == .inputCount(composition.input.count) ||
                $0.composingCount == .surfaceCount(composition.convertTarget.count)
            }.map(\.text).filter { !$0.isEmpty && seen.insert($0).inserted }
            texts = Array(texts.prefix(20))
            if !reading.isEmpty && !seen.contains(reading) { texts.append(reading) }
            let elapsed = start.duration(to: .now).components
            diagnostics()
            emit(Response(type: "result", id: request.id, sessionId: session, revision: revision,
                engine: engine, reason: responseReason, candidates: texts.map { CandidateText(text: $0) },
                elapsedMs: Double(elapsed.seconds) * 1000 + Double(elapsed.attoseconds) / 1e15))
        } catch {
            emit(Response(type: "error", id: request.id, sessionId: request.sessionId,
                revision: request.revision, code: error is HelperError ? "invalid-request" : "conversion-failed"))
        }
    }
}

do {
    let args = Array(CommandLine.arguments.dropFirst())
    guard args.count == 1 || args.count == 2 else { throw HelperError.arguments }
    let worker = try Worker(dictionary: URL(fileURLWithPath: args[0], isDirectory: true),
        model: args.count == 2 ? URL(fileURLWithPath: args[1]) : nil)
    let queue = DispatchQueue(label: "ime.converter")
    let capacity = DispatchSemaphore(value: 34)
    queue.async { worker.ready() }
    var pending = Data()
    // Keep byte framing bounded even when a peer never sends a newline. Reading
    // runs independently while the serial converter worker is doing inference.
    let stdinHandle = GetStdHandle(STD_INPUT_HANDLE)
    var buffer = [UInt8](repeating: 0, count: 8192)
    while true {
        var count: DWORD = 0
        let success = buffer.withUnsafeMutableBytes {
            ReadFile(stdinHandle, $0.baseAddress, DWORD($0.count), &count, nil)
        }
        if success == false {
            if GetLastError() == ERROR_BROKEN_PIPE { break }
            throw HelperError.invalidRequest
        }
        if count == 0 { break }
        for byte in buffer.prefix(Int(count)) {
            if byte == 10 {
                guard let line = String(data: pending, encoding: .utf8) else { throw HelperError.invalidRequest }
                let request = try JSONDecoder().decode(Request.self, from: Data(line.utf8))
                pending.removeAll(keepingCapacity: true)
                capacity.wait()
                queue.async { worker.handle(request); capacity.signal() }
            } else {
                guard pending.count < 1_048_576 else { throw HelperError.invalidRequest }
                pending.append(byte)
            }
        }
    }
    guard pending.isEmpty else { throw HelperError.invalidRequest }
    queue.sync {} // Flush accepted requests on orderly EOF; then release the process.
} catch {
    log("IME helper failed: \(error)")
    exit(1)
}
