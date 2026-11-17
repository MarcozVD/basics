---
type: "tech"
kind: "framework"
title: "SwiftUI"
layer: "mobile"
language: "swift"
use_when: ["Apple mobile screens written with Swift views","An iOS app needing Apple platform UI integration"]
avoid_when: ["Android UI must share the same implementation","React or Dart UI code is mandatory","A server API or browser-only web UI is the deliverable"]
performs_best: ["Declarative UI across supported Apple platforms"]
related: ["swift","jetpack-compose","flutter"]
practices: ["mobile-offline","mobile-state-navigation","mobile-signing","mobile-accessibility"]
checks: []
tags: ["mobile","swiftui"]
---

# SwiftUI

SwiftUI describes Apple-platform interfaces with Swift views and state. Keep navigation and model ownership explicit, test dynamic type and VoiceOver, and verify deployment-target availability. It is not an Android UI framework.

Related notes: [[swift]], [[jetpack-compose]], [[flutter]].

[Official reference](https://developer.apple.com/documentation/swiftui).
