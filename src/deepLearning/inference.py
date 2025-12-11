#!/usr/bin/env python3
"""
PyTorch Inference Server for SnipeBT
Loads trained model + scalers, accepts JSON via stdin, returns predictions via stdout
"""

import sys
import os

# Fix Windows encoding for emojis
if sys.platform == 'win32':
    os.environ['PYTHONIOENCODING'] = 'utf-8'
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import json
import torch
import pickle
import numpy as np
from pathlib import Path

# Get project root directory (SnipeBT/)
ROOT_DIR = Path(__file__).parent.parent.parent.resolve()

# Import model architecture
from model_pytorch import SnipeBTModel

class InferenceServer:
    def __init__(self, model_path=None, scalers_path=None):
        # Use absolute paths from ROOT_DIR
        if model_path is None:
            model_path = ROOT_DIR / 'best_model_pytorch.pth'
        if scalers_path is None:
            scalers_path = ROOT_DIR / 'scalers.pkl'
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        
        # Load model
        print(f"🔥 Loading model from {model_path}...", file=sys.stderr, flush=True)
        self.model = SnipeBTModel().to(self.device)
        checkpoint = torch.load(model_path, map_location=self.device, weights_only=False)
        self.model.load_state_dict(checkpoint['model_state_dict'])
        self.model.eval()
        print(f"✅ Model loaded (Epoch {checkpoint['epoch']}, Val AUC: {checkpoint['val_auc']:.4f})", 
              file=sys.stderr, flush=True)
        
        # Load scalers
        print(f"📊 Loading scalers from {scalers_path}...", file=sys.stderr, flush=True)
        with open(scalers_path, 'rb') as f:
            self.scalers = pickle.load(f)
        print(f"✅ Scalers loaded (candles, context, indicators, patterns)", file=sys.stderr, flush=True)
        
        print("🚀 Inference server ready!", file=sys.stderr, flush=True)
    
    def preprocess(self, raw_input):
        """
        Convert raw input to scaled tensors
        
        Input format:
        {
            "candles": [[open, high, low, close, volume], ...],  // 100 timesteps
            "context": [liquidity, marketCap, holders, age_hours, volume24h],
            "indicators": [rsi, macd, ema_fast, ema_slow, bbands_width],
            "patterns": [has_bullish_pin, has_bearish_pin, has_bullish_engulfing, 
                        has_bearish_engulfing, wick_rejection_ratio, body_to_range_ratio,
                        pattern_confidence, context_score]
        }
        """
        # Convert to numpy arrays
        candles = np.array(raw_input['candles'], dtype=np.float32)  # (100, 5)
        context = np.array(raw_input['context'], dtype=np.float32)  # (5,)
        indicators = np.array(raw_input['indicators'], dtype=np.float32)  # (5,)
        patterns = np.array(raw_input['patterns'], dtype=np.float32)  # (8,)
        
        # Validate shapes
        if candles.shape != (100, 5):
            raise ValueError(f"Expected candles shape (100, 5), got {candles.shape}")
        if context.shape != (5,):
            raise ValueError(f"Expected context shape (5,), got {context.shape}")
        if indicators.shape != (5,):
            raise ValueError(f"Expected indicators shape (5,), got {indicators.shape}")
        if patterns.shape != (8,):
            raise ValueError(f"Expected patterns shape (8,), got {patterns.shape}")
        
        # Scale features
        candles_scaled = self.scalers['candle_scaler'].transform(candles)  # (100, 5)
        context_scaled = self.scalers['context_scaler'].transform(context.reshape(1, -1))[0]  # (5,)
        indicators_scaled = self.scalers['indicator_scaler'].transform(indicators.reshape(1, -1))[0]  # (5,)
        patterns_scaled = patterns  # Patterns already normalized 0-1 or boolean
        
        # Combine context + indicators + patterns
        combined = np.concatenate([context_scaled, indicators_scaled, patterns_scaled])  # (18,)
        
        # Convert to tensors and add batch dimension
        candles_tensor = torch.tensor(candles_scaled, dtype=torch.float32).unsqueeze(0).to(self.device)  # (1, 100, 5)
        combined_tensor = torch.tensor(combined, dtype=torch.float32).unsqueeze(0).to(self.device)  # (1, 18)
        
        return candles_tensor, combined_tensor
    
    def predict(self, raw_input):
        """
        Run inference and return predictions
        
        Returns:
        {
            "profitable": 0.78,        // Probability 0-1
            "max_profit": 4.2,         // Expected max profit %
            "rug_risk": 0.05,          // Probability 0-1
            "confidence": 0.85         // Overall confidence 0-1
        }
        """
        try:
            # Preprocess
            candles, combined = self.preprocess(raw_input)
            
            # Inference
            with torch.no_grad():
                profitable_logit, max_profit_pred, rug_logit = self.model(candles, combined)
                
                # Convert to probabilities
                profitable_prob = torch.sigmoid(profitable_logit).item()
                rug_prob = torch.sigmoid(rug_logit).item()
                max_profit_value = max_profit_pred.item()
                
                # Calculate confidence (distance from 0.5 decision boundary)
                profitable_confidence = abs(profitable_prob - 0.5) * 2  # 0-1 scale
                rug_confidence = abs(rug_prob - 0.5) * 2
                overall_confidence = (profitable_confidence + rug_confidence) / 2
                
                return {
                    "profitable": float(profitable_prob),
                    "max_profit": float(max_profit_value),
                    "rug_risk": float(rug_prob),
                    "confidence": float(overall_confidence)
                }
        
        except Exception as e:
            return {
                "error": str(e),
                "profitable": 0.0,
                "max_profit": 0.0,
                "rug_risk": 1.0,
                "confidence": 0.0
            }
    
    def run(self):
        """
        Main loop: read JSON from stdin, write predictions to stdout
        """
        print("🎯 Listening for inference requests...", file=sys.stderr, flush=True)
        
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            
            try:
                # Parse input
                request = json.loads(line)
                
                # Run prediction
                result = self.predict(request)
                
                # Write result to stdout (TypeScript reads this)
                print(json.dumps(result), flush=True)
            
            except json.JSONDecodeError as e:
                error_result = {
                    "error": f"Invalid JSON: {e}",
                    "profitable": 0.0,
                    "max_profit": 0.0,
                    "rug_risk": 1.0,
                    "confidence": 0.0
                }
                print(json.dumps(error_result), flush=True)
            
            except Exception as e:
                error_result = {
                    "error": f"Inference failed: {e}",
                    "profitable": 0.0,
                    "max_profit": 0.0,
                    "rug_risk": 1.0,
                    "confidence": 0.0
                }
                print(json.dumps(error_result), flush=True)


if __name__ == '__main__':
    server = InferenceServer()
    server.run()
