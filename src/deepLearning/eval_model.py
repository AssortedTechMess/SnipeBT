#!/usr/bin/env python3
"""Quick script to evaluate and export the trained model"""

import torch
import numpy as np
from model_pytorch import SnipeBTModel, TradingDataset, evaluate_model, export_for_inference

device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

print("📂 Loading test data...")
data = np.load('../../processed_data.npz')
X_test_candles = data['X_test_candles']
X_test_combined = data['X_test_combined']
y_test = data['y_test']

test_dataset = TradingDataset(X_test_candles, X_test_combined, y_test)
test_loader = torch.utils.data.DataLoader(test_dataset, batch_size=64, shuffle=False)

print("📥 Loading best model...")
model = SnipeBTModel().to(device)
checkpoint = torch.load('../../best_model_pytorch.pth', weights_only=False)
model.load_state_dict(checkpoint['model_state_dict'])
print(f"✅ Loaded model from epoch {checkpoint['epoch']} with Val AUC: {checkpoint['val_auc']:.4f}")

# Evaluate on test set
evaluate_model(model, test_loader, device)

# Export for inference
export_for_inference(model)

print("\n✅ Evaluation and export complete!")
