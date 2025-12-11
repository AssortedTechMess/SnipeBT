"""
Add candlestick pattern features to existing training data
Uses EXACT same logic as dataCollector.ts detectCandlestickPatterns()
"""

import json
import numpy as np
from typing import Dict, List

def detect_candlestick_patterns(candles: List[Dict], context: Dict) -> Dict:
    """
    EXACT port of dataCollector.ts detectCandlestickPatterns()
    """
    if len(candles) < 2:
        return {
            'has_bullish_pin': False,
            'has_bearish_pin': False,
            'has_bullish_engulfing': False,
            'has_bearish_engulfing': False,
            'wick_rejection_ratio': 0.0,
            'body_to_range_ratio': 0.0,
            'pattern_confidence': 0.0,
            'context_score': 0.0,
        }
    
    # Analyze the last candle for patterns
    last_candle = candles[-1]
    prev_candle = candles[-2]
    
    # Calculate candle metrics
    body = abs(last_candle['close'] - last_candle['open'])
    upper_wick = last_candle['high'] - max(last_candle['close'], last_candle['open'])
    lower_wick = min(last_candle['close'], last_candle['open']) - last_candle['low']
    total_range = last_candle['high'] - last_candle['low']
    
    is_bullish = last_candle['close'] > last_candle['open']
    is_bearish = last_candle['close'] < last_candle['open']
    
    # Body to range ratio (strong candles have large bodies)
    body_to_range = body / total_range if total_range > 0 else 0
    
    # Wick rejection ratio (key EmperorBTC signal)
    wick_rejection_ratio = max(upper_wick, lower_wick) / body if body > 0 else 0
    
    # Pattern detection
    MIN_WICK_TO_BODY_RATIO = 2.0
    has_bullish_pin = False
    has_bearish_pin = False
    has_bullish_engulfing = False
    has_bearish_engulfing = False
    pattern_confidence = 0
    
    # 1. BULLISH PIN BAR: Long lower wick (buyers rejected lower prices)
    if lower_wick > body * MIN_WICK_TO_BODY_RATIO and is_bullish:
        has_bullish_pin = True
        wick_strength = (lower_wick / total_range) * 100 if total_range > 0 else 0
        pattern_confidence = max(pattern_confidence, min(60 + wick_strength * 0.3, 80) / 100)
    
    # 2. BEARISH PIN BAR: Long upper wick (sellers rejected higher prices)
    if upper_wick > body * MIN_WICK_TO_BODY_RATIO and is_bearish:
        has_bearish_pin = True
        wick_strength = (upper_wick / total_range) * 100 if total_range > 0 else 0
        pattern_confidence = max(pattern_confidence, min(60 + wick_strength * 0.3, 80) / 100)
    
    # 3. BULLISH ENGULFING: Strong green candle that engulfs previous
    prev_body = abs(prev_candle['close'] - prev_candle['open'])
    engulfs_previous = body > prev_body * 0.6  # Engulfs at least 60% of previous
    
    if is_bullish and engulfs_previous and body_to_range > 0.6:
        has_bullish_engulfing = True
        pattern_confidence = max(pattern_confidence, 0.65)
    
    # 4. BEARISH ENGULFING: Strong red candle
    if is_bearish and engulfs_previous and body_to_range > 0.6:
        has_bearish_engulfing = True
        pattern_confidence = max(pattern_confidence, 0.65)
    
    # Calculate context score (EmperorBTC: context = 50% of decision)
    context_score = calculate_context_score(candles, context)
    
    return {
        'has_bullish_pin': has_bullish_pin,
        'has_bearish_pin': has_bearish_pin,
        'has_bullish_engulfing': has_bullish_engulfing,
        'has_bearish_engulfing': has_bearish_engulfing,
        'wick_rejection_ratio': min(wick_rejection_ratio, 10),  # Cap at 10 for stability
        'body_to_range_ratio': body_to_range,
        'pattern_confidence': pattern_confidence,
        'context_score': context_score,
    }


def calculate_context_score(candles: List[Dict], token_context: Dict) -> float:
    """
    EXACT port of dataCollector.ts calculateContextScore()
    """
    score = 0.0
    
    # 1. Trend analysis (using price momentum over last 20 candles)
    if len(candles) >= 20:
        recent_candles = candles[-20:]
        first_price = recent_candles[0]['close']
        last_price = recent_candles[-1]['close']
        price_change = ((last_price - first_price) / first_price) * 100
        
        if price_change > 10:
            score += 0.30  # Strong bullish
        elif price_change > 0:
            score += 0.15  # Moderate bullish
        elif price_change < -10:
            score += 0.10  # Bearish (lower score)
    
    # 2. Support/Resistance (price position in recent range)
    if len(candles) >= 20:
        recent_candles = candles[-20:]
        highs = [c['high'] for c in recent_candles]
        lows = [c['low'] for c in recent_candles]
        recent_high = max(highs)
        recent_low = min(lows)
        current_price = candles[-1]['close']
        
        if recent_high != recent_low:
            price_position = (current_price - recent_low) / (recent_high - recent_low)
            
            # Near support (bottom 20%) = bullish context
            if price_position < 0.20:
                score += 0.25
            # Near resistance (top 10%) but still rising = continuation
            elif price_position > 0.90:
                score += 0.20
    
    # 3. Liquidity context
    liquidity = token_context.get('liquidity', 0)
    if liquidity > 500000:
        score += 0.20
    elif liquidity > 100000:
        score += 0.10
    
    return min(score, 1.0)  # Normalize to 0-1


def process_training_data(input_file: str, output_file: str):
    """
    Add pattern features to existing training data
    """
    print(f"📂 Loading existing training data from {input_file}...")
    
    with open(input_file, 'r') as f:
        data = json.load(f)
    
    examples = data.get('examples', data)
    print(f"✅ Loaded {len(examples):,} examples")
    
    # Check if already has patterns
    if examples and 'patterns' in examples[0]:
        print("⚠️ WARNING: Data already has pattern features!")
        response = input("Do you want to recalculate patterns? (yes/no): ")
        if response.lower() != 'yes':
            print("❌ Aborted")
            return
    
    print("🔄 Calculating candlestick patterns...")
    processed = 0
    
    for i, example in enumerate(examples):
        # Calculate patterns from existing candles
        patterns = detect_candlestick_patterns(example['candles'], example['context'])
        example['patterns'] = patterns
        
        processed += 1
        if processed % 1000 == 0:
            print(f"  Processed {processed:,}/{len(examples):,} examples ({processed/len(examples)*100:.1f}%)")
    
    print(f"✅ Processed all {processed:,} examples")
    
    # Verify patterns were added
    sample = examples[0]['patterns']
    print(f"\n📊 Sample pattern from first example:")
    print(f"  Bullish pin: {sample['has_bullish_pin']}")
    print(f"  Bearish pin: {sample['has_bearish_pin']}")
    print(f"  Wick rejection ratio: {sample['wick_rejection_ratio']:.2f}")
    print(f"  Body to range: {sample['body_to_range_ratio']:.2f}")
    print(f"  Pattern confidence: {sample['pattern_confidence']:.2f}")
    print(f"  Context score: {sample['context_score']:.2f}")
    
    # Count pattern occurrences
    bullish_pins = sum(1 for ex in examples if ex['patterns']['has_bullish_pin'])
    bearish_pins = sum(1 for ex in examples if ex['patterns']['has_bearish_pin'])
    bullish_engulfing = sum(1 for ex in examples if ex['patterns']['has_bullish_engulfing'])
    bearish_engulfing = sum(1 for ex in examples if ex['patterns']['has_bearish_engulfing'])
    
    print(f"\n📈 Pattern statistics:")
    print(f"  Bullish pin bars: {bullish_pins:,} ({bullish_pins/len(examples)*100:.1f}%)")
    print(f"  Bearish pin bars: {bearish_pins:,} ({bearish_pins/len(examples)*100:.1f}%)")
    print(f"  Bullish engulfing: {bullish_engulfing:,} ({bullish_engulfing/len(examples)*100:.1f}%)")
    print(f"  Bearish engulfing: {bearish_engulfing:,} ({bearish_engulfing/len(examples)*100:.1f}%)")
    
    # Save updated data
    print(f"\n💾 Saving to {output_file}...")
    
    # Preserve metadata if it exists
    if 'metadata' in data:
        output_data = {
            'examples': examples,
            'metadata': data['metadata']
        }
    else:
        output_data = {'examples': examples}
    
    with open(output_file, 'w') as f:
        json.dump(output_data, f)
    
    print(f"✅ Saved {len(examples):,} examples with pattern features!")
    print("\n🎯 Next steps:")
    print("  1. Run: python preprocessor.py")
    print("  2. Verify patterns are not all zeros")
    print("  3. Run: python model_pytorch.py")


if __name__ == '__main__':
    import sys
    
    # Use checkpoint file (most recent data)
    input_file = '../../trainingData_checkpoint.json'
    output_file = '../../trainingData_with_patterns.json'
    
    print("=" * 60)
    print("🕯️ EmperorBTC Pattern Calculator")
    print("=" * 60)
    print()
    
    try:
        process_training_data(input_file, output_file)
    except FileNotFoundError:
        print(f"❌ File not found: {input_file}")
        print("   Trying merged file...")
        input_file = '../../trainingData_merged.json'
        process_training_data(input_file, output_file)
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
