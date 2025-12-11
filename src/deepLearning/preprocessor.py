"""
Data Preprocessing for Deep Learning Model
Loads training data, scales features, splits dataset
"""

import json
import numpy as np
import pickle
import os
from sklearn.preprocessing import RobustScaler, StandardScaler
from sklearn.model_selection import train_test_split
from typing import Tuple, Dict

# Get root directory (2 levels up from this file)
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

class DataPreprocessor:
    def __init__(self, data_path: str = None):
        if data_path is None:
            data_path = os.path.join(ROOT_DIR, 'trainingData_full.json')
        elif not os.path.isabs(data_path):
            data_path = os.path.join(ROOT_DIR, data_path)
        self.data_path = data_path
        self.root_dir = ROOT_DIR
        
        # Scalers for different feature types
        self.candle_scaler = RobustScaler()  # Robust to outliers
        self.context_scaler = StandardScaler()
        self.indicator_scaler = StandardScaler()
        
        print(f"📂 Loading data from {data_path}...")
        
    def load_and_preprocess(self) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        """
        Load training data and preprocess into model-ready format
        
        Returns:
            X_train, X_val, X_test, y_train, y_val, y_test
        """
        # Load JSON data (from checkpoint or full file)
        with open(self.data_path, 'r') as f:
            data = json.load(f)
        
        # Get examples array (checkpoint structure has it at root level)
        examples = data.get('examples', data)
        # Load JSON data
        with open(self.data_path, 'r') as f:
            data = json.load(f)
        
        examples = data['examples']
        print(f"✅ Loaded {len(examples):,} examples")
        
        # Extract features and labels
        X_candles = []
        X_context = []
        X_indicators = []
        X_patterns = []  # NEW: Separate array for pattern features
        y_profitable = []
        y_max_profit = []
        y_rug_risk = []
        
        for example in examples:
            # Candles: (100, 5) - [open, high, low, close, volume]
            candles = np.array([[c['open'], c['high'], c['low'], c['close'], c['volume']] 
                               for c in example['candles']])
            X_candles.append(candles)
            
            # Context: (5,) - [liquidity, marketCap, holders, age, volume24h]
            context = np.array([
                example['context']['liquidity'],
                example['context']['marketCap'],
                example['context']['holders'],
                example['context']['age'],
                example['context']['volume24h']
            ])
            X_context.append(context)
            
            # Indicators: (5,) - [rsi, macd, ema_fast, ema_slow, bbands_width]
            indicators = np.array([
                example['indicators']['rsi'],
                example['indicators']['macd'],
                example['indicators']['ema_fast'],
                example['indicators']['ema_slow'],
                example['indicators']['bbands_width']
            ])
            X_indicators.append(indicators)
            
            # Patterns: (8,) - EmperorBTC candlestick patterns
            # Check if pattern data exists (for backward compatibility)
            if 'patterns' in example:
                patterns = np.array([
                    1.0 if example['patterns']['has_bullish_pin'] else 0.0,
                    1.0 if example['patterns']['has_bearish_pin'] else 0.0,
                    1.0 if example['patterns']['has_bullish_engulfing'] else 0.0,
                    1.0 if example['patterns']['has_bearish_engulfing'] else 0.0,
                    example['patterns']['wick_rejection_ratio'],
                    example['patterns']['body_to_range_ratio'],
                    example['patterns']['pattern_confidence'],
                    example['patterns']['context_score']
                ])
            else:
                # Fallback: zeros if no pattern data (will be trained once data is regenerated)
                patterns = np.zeros(8)
            X_patterns.append(patterns)
            
            # Labels
            y_profitable.append(1 if example['labels']['profitable'] else 0)
            y_max_profit.append(example['labels']['max_profit'])
            y_rug_risk.append(1 if example['labels']['rug_risk'] else 0)
        
        # Convert to numpy arrays
        X_candles = np.array(X_candles)  # Shape: (N, 100, 5)
        X_context = np.array(X_context)  # Shape: (N, 5)
        X_indicators = np.array(X_indicators)  # Shape: (N, 5)
        X_patterns = np.array(X_patterns)  # Shape: (N, 8)
        y_profitable = np.array(y_profitable)  # Shape: (N,)
        y_max_profit = np.array(y_max_profit)  # Shape: (N,)
        y_rug_risk = np.array(y_rug_risk)  # Shape: (N,)
        
        print(f"📊 Data shapes:")
        print(f"  Candles: {X_candles.shape}")
        print(f"  Context: {X_context.shape}")
        print(f"  Indicators: {X_indicators.shape}")
        print(f"  Patterns: {X_patterns.shape}")
        print(f"  Labels: profitable={y_profitable.shape}, max_profit={y_max_profit.shape}, rug_risk={y_rug_risk.shape}")
        
        # Check if pattern data exists
        if X_patterns.sum() == 0:
            print("⚠️ WARNING: No pattern data found in training examples (all zeros)")
            print("   Model will train without pattern features until data is regenerated")
        
        # Scale features
        print("⚙️ Scaling features...")
        X_candles_scaled = self._scale_candles(X_candles)
        X_context_scaled = self.context_scaler.fit_transform(X_context)
        X_indicators_scaled = self.indicator_scaler.fit_transform(X_indicators)
        
        # Combine context + indicators + patterns (5 + 5 + 8 = 18)
        X_combined = np.concatenate([X_context_scaled, X_indicators_scaled, X_patterns], axis=1)
        
        # Combine labels
        y = np.column_stack([y_profitable, y_max_profit, y_rug_risk])
        
        # Split dataset: 70% train, 15% val, 15% test
        print("📦 Splitting dataset (70/15/15)...")
        
        # First split: 70% train, 30% temp
        indices = np.arange(len(X_candles_scaled))
        train_idx, temp_idx = train_test_split(
            indices, 
            test_size=0.3, 
            random_state=42,
            stratify=y_profitable  # Stratify by profitable label
        )
        
        # Second split: 50% val, 50% test (of the 30%)
        val_idx, test_idx = train_test_split(
            temp_idx,
            test_size=0.5,
            random_state=42,
            stratify=y_profitable[temp_idx]
        )
        
        # Create train/val/test sets
        X_train = {
            'candles': X_candles_scaled[train_idx],
            'combined': X_combined[train_idx]  # 18 features: context + indicators + patterns
        }
        X_val = {
            'candles': X_candles_scaled[val_idx],
            'combined': X_combined[val_idx]
        }
        X_test = {
            'candles': X_candles_scaled[test_idx],
            'combined': X_combined[test_idx]
        }
        
        y_train = y[train_idx]
        y_val = y[val_idx]
        y_test = y[test_idx]
        
        print(f"✅ Split complete:")
        print(f"  Train: {len(train_idx):,} examples ({len(train_idx)/len(indices)*100:.1f}%)")
        print(f"  Val:   {len(val_idx):,} examples ({len(val_idx)/len(indices)*100:.1f}%)")
        print(f"  Test:  {len(test_idx):,} examples ({len(test_idx)/len(indices)*100:.1f}%)")
        
        # Print label distribution
        print(f"\n📈 Label distribution:")
        print(f"  Train - Profitable: {np.sum(y_train[:, 0])}/{len(y_train)} ({np.sum(y_train[:, 0])/len(y_train)*100:.1f}%)")
        print(f"  Val   - Profitable: {np.sum(y_val[:, 0])}/{len(y_val)} ({np.sum(y_val[:, 0])/len(y_val)*100:.1f}%)")
        print(f"  Test  - Profitable: {np.sum(y_test[:, 0])}/{len(y_test)} ({np.sum(y_test[:, 0])/len(y_test)*100:.1f}%)")
        
        return X_train, X_val, X_test, y_train, y_val, y_test
    
    def _scale_candles(self, X_candles: np.ndarray) -> np.ndarray:
        """
        Scale candle data using RobustScaler
        Handles outliers better than StandardScaler
        """
        N, timesteps, features = X_candles.shape
        
        # Reshape to (N * timesteps, features) for scaling
        X_reshaped = X_candles.reshape(-1, features)
        
        # Scale
        X_scaled = self.candle_scaler.fit_transform(X_reshaped)
        
        # Reshape back to (N, timesteps, features)
        X_candles_scaled = X_scaled.reshape(N, timesteps, features)
        
        return X_candles_scaled
    
    def save_scalers(self, output_path: str = None):
        """
        Save fitted scalers for inference
        """
        if output_path is None:
            output_path = os.path.join(self.root_dir, 'scalers.pkl')
        scalers = {
            'candle_scaler': self.candle_scaler,
            'context_scaler': self.context_scaler,
            'indicator_scaler': self.indicator_scaler
        }
        
        with open(output_path, 'wb') as f:
            pickle.dump(scalers, f)
        
        print(f"💾 Saved scalers to {output_path}")
    
    def save_processed_data(self, X_train, X_val, X_test, y_train, y_val, y_test, 
                           output_path: str = None):
        """
        Save processed data to disk
        """
        if output_path is None:
            output_path = os.path.join(self.root_dir, 'processed_data.npz')
        np.savez_compressed(
            output_path,
            X_train_candles=X_train['candles'],
            X_train_combined=X_train['combined'],
            X_val_candles=X_val['candles'],
            X_val_combined=X_val['combined'],
            X_test_candles=X_test['candles'],
            X_test_combined=X_test['combined'],
            y_train=y_train,
            y_val=y_val,
            y_test=y_test
        )
        
        print(f"💾 Saved processed data to {output_path}")


def main():
    """
    Main preprocessing pipeline
    """
    print("=" * 60)
    print("🧠 Deep Learning Data Preprocessing")
    print("=" * 60)
    
    preprocessor = DataPreprocessor()
    
    # Load and preprocess
    X_train, X_val, X_test, y_train, y_val, y_test = preprocessor.load_and_preprocess()
    
    # Save scalers for inference
    preprocessor.save_scalers()
    
    # Save processed data for training
    preprocessor.save_processed_data(X_train, X_val, X_test, y_train, y_val, y_test)
    
    print("\n✅ Preprocessing complete!")
    print("=" * 60)


if __name__ == '__main__':
    main()
