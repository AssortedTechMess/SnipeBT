#!/usr/bin/env python3
"""
Quick test of inference pipeline
"""

import sys
import json

# Add example input
example_input = {
    "candles": [[0.001, 0.0012, 0.0009, 0.0011, 1000] for _ in range(100)],
    "context": [500000, 1000000, 150, 2.5, 250000],  # liquidity, mcap, holders, age, volume
    "indicators": [55, 0.0001, 0.0011, 0.001, 0.05],  # rsi, macd, ema_fast, ema_slow, bbands
    "patterns": [1, 0, 1, 0, 3.5, 0.7, 0.75, 0.6]  # bullish_pin, bearish_pin, etc.
}

print(json.dumps(example_input))
