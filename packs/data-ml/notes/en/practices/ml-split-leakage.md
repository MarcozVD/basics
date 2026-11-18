---
type: "practice"
title: "Split before fitting"
applies_to: ["python"]
---

Create training, validation and held-out test partitions before fitting transformations. Use training data alone for fitted preprocessing; tune against validation and evaluate the final choice once on untouched test data. Respect time order and shared entities when splitting. Record metrics and a simple baseline.
