import Foundation

public enum JSONValue {
    public static func string(_ value: Any?) -> String {
        if let text = value as? String { return text }
        if let number = value as? NSNumber { return number.stringValue }
        return ""
    }

    public static func int(_ value: Any?) -> Int {
        if let number = value as? Int { return number }
        if let number = value as? Double { return Int(number) }
        if let number = value as? NSNumber { return number.intValue }
        if let text = value as? String, let number = Int(text) { return number }
        return 0
    }

    public static func double(_ value: Any?) -> Double {
        if let number = value as? Double { return number }
        if let number = value as? Int { return Double(number) }
        if let number = value as? NSNumber { return number.doubleValue }
        if let text = value as? String, let number = Double(text) { return number }
        return 0
    }

    public static func stringArray(_ value: Any?) -> [String] {
        if let list = value as? [String] {
            return list.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        }
        if let list = value as? [Any] {
            return list.map { string($0).trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        }
        let single = string(value).trimmingCharacters(in: .whitespacesAndNewlines)
        return single.isEmpty ? [] : [single]
    }

    public static func dictionary(_ value: Any?) -> [String: Any] {
        value as? [String: Any] ?? [:]
    }
}
