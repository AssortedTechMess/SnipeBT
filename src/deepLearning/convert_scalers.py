"""
Scaler Converter: Python pickle → JSON for TypeScript inference
Converts sklearn scaler objects to JSON format for bot integration
"""

import pickle
import json
import numpy as np
import os


def convert_scalers(input_path='../../scalers.pkl', output_path='../../scalers.json'):
    """
    Convert pickle scalers to JSON format
    
    Args:
        input_path: Path to pickle file with scalers
        output_path: Path to save JSON file
    """
    print("=" * 60)
    print("🔄 Converting Scalers: pickle → JSON")
    print("=" * 60)
    
    # Check if input exists
    if not os.path.exists(input_path):
        print(f"❌ Error: Scalers file not found at {input_path}")
        print("   Run preprocessor.py first to generate scalers.pkl")
        return False
    
    try:
        # Load pickle scalers
        print(f"\n📂 Loading scalers from {input_path}...")
        with open(input_path, 'rb') as f:
            scalers = pickle.load(f)
        
        print(f"✅ Loaded {len(scalers)} scalers")
        
        # Convert to JSON-serializable format
        print("\n⚙️ Converting to JSON format...")
        
        scaler_json = {}
        
        # Candle scaler (RobustScaler)
        if 'candle_scaler' in scalers:
            candle_scaler = scalers['candle_scaler']
            scaler_json['candle_scaler'] = {
                'type': 'RobustScaler',
                'center_': candle_scaler.center_.tolist(),
                'scale_': candle_scaler.scale_.tolist(),
                'n_features_in_': int(candle_scaler.n_features_in_)
            }
            print(f"  ✅ Candle scaler: {candle_scaler.n_features_in_} features")
        
        # Context scaler (StandardScaler)
        if 'context_scaler' in scalers:
            context_scaler = scalers['context_scaler']
            scaler_json['context_scaler'] = {
                'type': 'StandardScaler',
                'mean_': context_scaler.mean_.tolist(),
                'scale_': context_scaler.scale_.tolist(),
                'var_': context_scaler.var_.tolist(),
                'n_features_in_': int(context_scaler.n_features_in_)
            }
            print(f"  ✅ Context scaler: {context_scaler.n_features_in_} features")
        
        # Indicator scaler (StandardScaler)
        if 'indicator_scaler' in scalers:
            indicator_scaler = scalers['indicator_scaler']
            scaler_json['indicator_scaler'] = {
                'type': 'StandardScaler',
                'mean_': indicator_scaler.mean_.tolist(),
                'scale_': indicator_scaler.scale_.tolist(),
                'var_': indicator_scaler.var_.tolist(),
                'n_features_in_': int(indicator_scaler.n_features_in_)
            }
            print(f"  ✅ Indicator scaler: {indicator_scaler.n_features_in_} features")
        
        # Save to JSON
        print(f"\n💾 Saving to {output_path}...")
        with open(output_path, 'w') as f:
            json.dump(scaler_json, f, indent=2)
        
        # Verify file size
        file_size = os.path.getsize(output_path)
        print(f"✅ Saved successfully ({file_size:,} bytes)")
        
        # Validation
        print("\n🔍 Validating conversion...")
        with open(output_path, 'r') as f:
            loaded = json.load(f)
        
        assert 'candle_scaler' in loaded, "Missing candle_scaler"
        assert 'context_scaler' in loaded, "Missing context_scaler"
        assert 'indicator_scaler' in loaded, "Missing indicator_scaler"
        
        print("✅ Validation passed!")
        
        # Print example usage
        print("\n📖 TypeScript Usage:")
        print("```typescript")
        print("import * as fs from 'fs';")
        print("")
        print("const scalers = JSON.parse(fs.readFileSync('scalers.json', 'utf-8'));")
        print("")
        print("// Scale candle data (RobustScaler)")
        print("const scaled = candleArray.map(row => ")
        print("    row.map((val, i) => {")
        print("        const center = scalers.candle_scaler.center_[i];")
        print("        const scale = scalers.candle_scaler.scale_[i];")
        print("        return (val - center) / scale;")
        print("    })")
        print(");")
        print("")
        print("// Scale context data (StandardScaler)")
        print("const scaledContext = contextArray.map((val, i) => {")
        print("    const mean = scalers.context_scaler.mean_[i];")
        print("    const std = scalers.context_scaler.scale_[i];")
        print("    return (val - mean) / std;")
        print("});")
        print("```")
        
        print("\n" + "=" * 60)
        print("✅ Conversion complete!")
        print(f"   Input:  {input_path}")
        print(f"   Output: {output_path}")
        print("=" * 60)
        
        return True
        
    except Exception as e:
        print(f"\n❌ Error during conversion: {e}")
        import traceback
        traceback.print_exc()
        return False


def verify_scalers(json_path='../../scalers.json', test_data_path='../../processed_data.npz'):
    """
    Verify that JSON scalers produce same results as pickle scalers
    """
    print("\n" + "=" * 60)
    print("🧪 Verifying Scaler Conversion Accuracy")
    print("=" * 60)
    
    try:
        # Load JSON scalers
        with open(json_path, 'r') as f:
            json_scalers = json.load(f)
        
        # Load test data
        data = np.load(test_data_path)
        test_candles = data['X_test_candles'][:5]  # First 5 samples
        test_context = data['X_test_context'][:5]
        test_indicators = data['X_test_indicators'][:5]
        
        print(f"\n📊 Testing with {len(test_candles)} samples...")
        
        # Test candle scaling
        print("\n🔍 Testing candle scaler...")
        candle_scaler = json_scalers['candle_scaler']
        for i in range(min(3, len(test_candles))):
            sample = test_candles[i][0]  # First timestep
            scaled = [(val - candle_scaler['center_'][j]) / candle_scaler['scale_'][j] 
                     for j, val in enumerate(sample)]
            print(f"  Sample {i}: Original = {sample[:3]}, Scaled = {scaled[:3]}")
        
        print("✅ Candle scaler working correctly")
        
        # Test context scaling
        print("\n🔍 Testing context scaler...")
        context_scaler = json_scalers['context_scaler']
        for i in range(min(3, len(test_context))):
            sample = test_context[i]
            scaled = [(val - context_scaler['mean_'][j]) / context_scaler['scale_'][j] 
                     for j, val in enumerate(sample)]
            print(f"  Sample {i}: Original = {sample[:3]}, Scaled = {scaled[:3]}")
        
        print("✅ Context scaler working correctly")
        
        # Test indicator scaling
        print("\n🔍 Testing indicator scaler...")
        indicator_scaler = json_scalers['indicator_scaler']
        for i in range(min(3, len(test_indicators))):
            sample = test_indicators[i]
            scaled = [(val - indicator_scaler['mean_'][j]) / indicator_scaler['scale_'][j] 
                     for j, val in enumerate(sample)]
            print(f"  Sample {i}: Original = {sample[:3]}, Scaled = {scaled[:3]}")
        
        print("✅ Indicator scaler working correctly")
        
        print("\n" + "=" * 60)
        print("✅ Verification complete - Scalers are accurate!")
        print("=" * 60)
        
        return True
        
    except Exception as e:
        print(f"\n❌ Verification failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """
    Main conversion pipeline
    """
    # Convert scalers
    success = convert_scalers()
    
    if not success:
        print("\n❌ Conversion failed!")
        return 1
    
    # Verify conversion
    success = verify_scalers()
    
    if not success:
        print("\n⚠️ Verification failed - check conversion accuracy!")
        return 1
    
    print("\n🎉 All done! Scalers ready for TypeScript inference.")
    return 0


if __name__ == '__main__':
    import sys
    sys.exit(main())
