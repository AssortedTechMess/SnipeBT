#!/usr/bin/env python3
"""
PyTorch implementation of SnipeBT Deep Learning Model V2
Converts TensorFlow LSTM + Attention architecture to PyTorch
Compatible with Python 3.14
"""

import sys
import os

# Fix Windows encoding for emoji/unicode characters
if sys.platform == 'win32':
    os.environ['PYTHONIOENCODING'] = 'utf-8'
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# Get root directory (2 levels up from this file)
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score
import json
from datetime import datetime
from pathlib import Path

# Set device
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
print(f"Using device: {device}")
if torch.cuda.is_available():
    print(f"   GPU: {torch.cuda.get_device_name(0)}")


class ScaledDotProductAttention(nn.Module):
    """
    Multi-head scaled dot-product attention mechanism
    PyTorch version of TensorFlow implementation
    """
    def __init__(self, d_model: int, num_heads: int, dropout: float = 0.1):
        super().__init__()
        self.d_model = d_model
        self.num_heads = num_heads
        self.d_head = d_model // num_heads
        
        assert d_model % num_heads == 0, "d_model must be divisible by num_heads"
        
        # Q, K, V projections
        self.q_linear = nn.Linear(d_model, d_model)
        self.k_linear = nn.Linear(d_model, d_model)
        self.v_linear = nn.Linear(d_model, d_model)
        
        # Output projection
        self.out_linear = nn.Linear(d_model, d_model)
        self.dropout = nn.Dropout(dropout)
        
    def forward(self, x):
        """
        Args:
            x: [batch, seq_len, d_model]
        Returns:
            [batch, seq_len, d_model]
        """
        batch_size, seq_len, _ = x.shape
        
        # Linear projections and split into heads
        # [batch, seq_len, d_model] -> [batch, num_heads, seq_len, d_head]
        Q = self.q_linear(x).view(batch_size, seq_len, self.num_heads, self.d_head).transpose(1, 2)
        K = self.k_linear(x).view(batch_size, seq_len, self.num_heads, self.d_head).transpose(1, 2)
        V = self.v_linear(x).view(batch_size, seq_len, self.num_heads, self.d_head).transpose(1, 2)
        
        # Scaled dot-product attention
        # [batch, num_heads, seq_len, seq_len]
        scores = torch.matmul(Q, K.transpose(-2, -1)) / np.sqrt(self.d_head)
        attn_weights = F.softmax(scores, dim=-1)
        attn_weights = self.dropout(attn_weights)
        
        # Apply attention to values
        # [batch, num_heads, seq_len, d_head]
        attn_output = torch.matmul(attn_weights, V)
        
        # Concatenate heads
        # [batch, seq_len, d_model]
        attn_output = attn_output.transpose(1, 2).contiguous().view(batch_size, seq_len, self.d_model)
        
        # Final linear projection
        output = self.out_linear(attn_output)
        
        return output


class SnipeBTModel(nn.Module):
    """
    Enhanced deep learning model for Solana token trading
    Architecture: BiLSTM + Multi-head Attention + Residuals + Layer Norm
    
    Inputs:
        - candles: [batch, 100, 5] - OHLCV (open, high, low, close, volume)
        - context: [batch, 5] - liquidity, marketCap, holders, age, volume24h
        - indicators: [batch, 13] - rsi, macd, ema_fast, ema_slow, bbands_width, + 8 EmperorBTC patterns
    
    Outputs:
        - profitable: [batch, 1] - binary classification (0=loss, 1=profit)
        - max_profit: [batch, 1] - regression (max profit percentage)
        - rug_risk: [batch, 1] - binary classification (0=safe, 1=rug)
    """
    def __init__(self):
        super().__init__()
        
        # ===== CANDLES PROCESSING (BiLSTM + Attention) =====
        self.lstm1 = nn.LSTM(
            input_size=5,  # OHLCV
            hidden_size=128,
            num_layers=1,
            batch_first=True,
            bidirectional=True,
            dropout=0.3
        )
        self.ln_lstm1 = nn.LayerNorm(256)  # BiLSTM output: 128 * 2 = 256
        
        self.lstm2 = nn.LSTM(
            input_size=256,
            hidden_size=64,
            num_layers=1,
            batch_first=True,
            bidirectional=True,
            dropout=0.3
        )
        self.ln_lstm2 = nn.LayerNorm(128)  # BiLSTM output: 64 * 2 = 128
        
        # Residual projection (256 -> 128)
        self.residual_projection = nn.Linear(256, 128)
        
        # Attention with residual
        self.attention = ScaledDotProductAttention(d_model=128, num_heads=4, dropout=0.1)
        self.ln_attention = nn.LayerNorm(128)
        
        # ===== CONTEXT & INDICATORS & PATTERNS PROCESSING =====
        self.context_dense1 = nn.Linear(18, 128)  # 5 (context) + 5 (indicators) + 8 (patterns) = 18
        self.ln_context1 = nn.LayerNorm(128)
        self.dropout_context1 = nn.Dropout(0.3)
        
        self.context_dense2 = nn.Linear(128, 64)
        self.ln_context2 = nn.LayerNorm(64)
        self.dropout_context2 = nn.Dropout(0.3)
        
        # Residual projection (128 -> 64)
        self.context_residual_proj = nn.Linear(128, 64)
        
        # ===== FULLY CONNECTED LAYERS =====
        # Input: 128 (candles) + 64 (context) = 192
        self.fc1 = nn.Linear(192, 256)
        self.ln_fc1 = nn.LayerNorm(256)
        self.dropout_fc1 = nn.Dropout(0.4)
        
        self.fc2 = nn.Linear(256, 128)
        self.ln_fc2 = nn.LayerNorm(128)
        self.dropout_fc2 = nn.Dropout(0.3)
        
        self.fc3 = nn.Linear(128, 64)
        self.ln_fc3 = nn.LayerNorm(64)
        self.dropout_fc3 = nn.Dropout(0.3)
        
        # ===== OUTPUT HEADS =====
        self.profitable_head = nn.Linear(64, 1)
        self.max_profit_head = nn.Linear(64, 1)
        self.rug_risk_head = nn.Linear(64, 1)
        
    def forward(self, candles, combined):
        """
        Args:
            candles: [batch, 100, 5]
            combined: [batch, 18] - context + indicators + patterns
        Returns:
            profitable: [batch, 1]
            max_profit: [batch, 1]
            rug_risk: [batch, 1]
        """
        # ===== CANDLES PROCESSING =====
        # First BiLSTM
        x1, _ = self.lstm1(candles)  # [batch, 30, 256]
        x1 = self.ln_lstm1(x1)
        
        # Second BiLSTM
        x2, _ = self.lstm2(x1)  # [batch, 30, 128]
        x2 = self.ln_lstm2(x2)
        
        # Residual connection (project x1 from 256 to 128)
        x1_proj = self.residual_projection(x1)  # [batch, 30, 128]
        x2 = x2 + x1_proj  # Residual add
        
        # Attention with residual
        attn_out = self.attention(x2)  # [batch, 30, 128]
        attn_out = self.ln_attention(attn_out)
        attn_out = attn_out + x2  # Residual add
        
        # Global average pooling
        candles_features = torch.mean(attn_out, dim=1)  # [batch, 128]
        
        # ===== CONTEXT & INDICATORS & PATTERNS PROCESSING =====
        # combined already has all 18 features concatenated
        
        # Dense layers with residuals
        ctx1 = F.relu(self.context_dense1(combined))  # [batch, 128]
        ctx1 = self.ln_context1(ctx1)
        ctx1 = self.dropout_context1(ctx1)
        
        ctx2 = F.relu(self.context_dense2(ctx1))  # [batch, 64]
        ctx2 = self.ln_context2(ctx2)
        ctx2 = self.dropout_context2(ctx2)
        
        # Residual connection (project ctx1 from 128 to 64)
        ctx1_proj = self.context_residual_proj(ctx1)  # [batch, 64]
        context_features = ctx2 + ctx1_proj  # Residual add
        
        # ===== MERGE ALL FEATURES =====
        merged = torch.cat([candles_features, context_features], dim=1)  # [batch, 192]
        
        # ===== FULLY CONNECTED LAYERS =====
        fc1 = F.relu(self.fc1(merged))  # [batch, 256]
        fc1 = self.ln_fc1(fc1)
        fc1 = self.dropout_fc1(fc1)
        
        fc2 = F.relu(self.fc2(fc1))  # [batch, 128]
        fc2 = self.ln_fc2(fc2)
        fc2 = self.dropout_fc2(fc2)
        
        fc3 = F.relu(self.fc3(fc2))  # [batch, 64]
        fc3 = self.ln_fc3(fc3)
        fc3 = self.dropout_fc3(fc3)
        
        # ===== OUTPUT HEADS =====
        profitable = torch.sigmoid(self.profitable_head(fc3))  # [batch, 1]
        max_profit = self.max_profit_head(fc3)  # [batch, 1] - linear for regression
        rug_risk = torch.sigmoid(self.rug_risk_head(fc3))  # [batch, 1]
        
        return profitable, max_profit, rug_risk


class TradingDataset(Dataset):
    """PyTorch Dataset for trading data"""
    def __init__(self, X_candles, X_combined, y):
        self.candles = torch.FloatTensor(X_candles)
        self.combined = torch.FloatTensor(X_combined)  # 18 features: context + indicators + patterns
        self.y = torch.FloatTensor(y)
        
    def __len__(self):
        return len(self.candles)
    
    def __getitem__(self, idx):
        return {
            'candles': self.candles[idx],
            'combined': self.combined[idx],
            'profitable': self.y[idx, 0],
            'max_profit': self.y[idx, 1],
            'rug_risk': self.y[idx, 2]
        }


def compute_class_weights(y_train):
    """Compute class weights for imbalanced data"""
    from sklearn.utils.class_weight import compute_class_weight
    
    # Profitable class weights
    profitable_weights = compute_class_weight(
        class_weight='balanced',
        classes=np.unique(y_train[:, 0]),
        y=y_train[:, 0]
    )
    
    # Rug risk class weights
    rug_weights = compute_class_weight(
        class_weight='balanced',
        classes=np.unique(y_train[:, 2]),
        y=y_train[:, 2]
    )
    
    print(f"📊 Class weights calculated:")
    print(f"  Profitable: {dict(enumerate(profitable_weights))}")
    print(f"  Rug Risk: {dict(enumerate(rug_weights))}")
    
    return {
        'profitable': profitable_weights,
        'rug_risk': rug_weights
    }


def get_sample_weights(y_train, class_weights):
    """Get sample weights for each training example"""
    profitable_weights = np.array([class_weights['profitable'][int(y)] for y in y_train[:, 0]])
    rug_weights = np.array([class_weights['rug_risk'][int(y)] for y in y_train[:, 2]])
    
    # Average the weights for overall sample weighting
    sample_weights = (profitable_weights + rug_weights) / 2.0
    
    return torch.FloatTensor(sample_weights)


class WeightedMultiTaskLoss(nn.Module):
    """
    Multi-task loss with class weights and task-specific weighting
    """
    def __init__(self, class_weights):
        super().__init__()
        self.profitable_weight_0 = class_weights['profitable'][0]
        self.profitable_weight_1 = class_weights['profitable'][1]
        self.rug_weight_0 = class_weights['rug_risk'][0]
        # Handle single-class case (no rugs in dataset)
        self.rug_weight_1 = class_weights['rug_risk'][1] if len(class_weights['rug_risk']) > 1 else 1.0
        
    def forward(self, profitable_pred, max_profit_pred, rug_pred, 
                profitable_true, max_profit_true, rug_true):
        """
        Args:
            *_pred: Model predictions
            *_true: Ground truth labels
        Returns:
            total_loss, profitable_loss, max_profit_loss, rug_loss
        """
        # Ensure proper shapes (squeeze but keep at least 1D)
        profitable_pred = profitable_pred.view(-1)
        max_profit_pred = max_profit_pred.view(-1)
        rug_pred = rug_pred.view(-1)
        
        # Binary cross-entropy with class weights
        bce_profitable = F.binary_cross_entropy(
            profitable_pred,
            profitable_true,
            reduction='none'
        )
        # Apply class weights
        weights_profitable = torch.where(
            profitable_true == 1,
            torch.tensor(self.profitable_weight_1, device=bce_profitable.device),
            torch.tensor(self.profitable_weight_0, device=bce_profitable.device)
        )
        profitable_loss = (bce_profitable * weights_profitable).mean()
        
        # MSE for regression (max_profit)
        max_profit_loss = F.mse_loss(max_profit_pred, max_profit_true)
        
        # Binary cross-entropy with class weights for rug risk
        bce_rug = F.binary_cross_entropy(
            rug_pred,
            rug_true,
            reduction='none'
        )
        # Apply class weights
        weights_rug = torch.where(
            rug_true == 1,
            torch.tensor(self.rug_weight_1, device=bce_rug.device),
            torch.tensor(self.rug_weight_0, device=bce_rug.device)
        )
        rug_loss = (bce_rug * weights_rug).mean()
        
        # Task-specific loss weights (matching TensorFlow version)
        total_loss = 1.0 * profitable_loss + 0.5 * max_profit_loss + 1.0 * rug_loss
        
        return total_loss, profitable_loss, max_profit_loss, rug_loss


def create_lr_schedule(initial_lr=0.0001, warmup_epochs=10, total_epochs=100):
    """
    Learning rate schedule with warmup and cosine annealing
    """
    def lr_lambda(epoch):
        if epoch < warmup_epochs:
            # Linear warmup
            return (epoch + 1) / warmup_epochs
        else:
            # Cosine annealing after warmup
            progress = (epoch - warmup_epochs) / (total_epochs - warmup_epochs)
            return 0.5 * (1.0 + np.cos(np.pi * progress))
    
    return lr_lambda


def train_epoch(model, train_loader, criterion, optimizer, device):
    """Train for one epoch"""
    model.train()
    total_loss = 0.0
    profitable_loss_sum = 0.0
    max_profit_loss_sum = 0.0
    rug_loss_sum = 0.0
    
    for batch in train_loader:
        candles = batch['candles'].to(device)
        combined = batch['combined'].to(device)
        profitable_true = batch['profitable'].to(device)
        max_profit_true = batch['max_profit'].to(device)
        rug_true = batch['rug_risk'].to(device)
        
        # Forward pass
        profitable_pred, max_profit_pred, rug_pred = model(candles, combined)
        
        # Compute loss
        loss, p_loss, mp_loss, r_loss = criterion(
            profitable_pred, max_profit_pred, rug_pred,
            profitable_true, max_profit_true, rug_true
        )
        
        # Backward pass
        optimizer.zero_grad()
        loss.backward()
        
        # Gradient clipping (matching TensorFlow clipnorm=1.0)
        torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
        
        optimizer.step()
        
        # Accumulate losses
        total_loss += loss.item()
        profitable_loss_sum += p_loss.item()
        max_profit_loss_sum += mp_loss.item()
        rug_loss_sum += r_loss.item()
    
    num_batches = len(train_loader)
    return {
        'total': total_loss / num_batches,
        'profitable': profitable_loss_sum / num_batches,
        'max_profit': max_profit_loss_sum / num_batches,
        'rug_risk': rug_loss_sum / num_batches
    }


def validate_epoch(model, val_loader, criterion, device):
    """Validate for one epoch"""
    model.eval()
    total_loss = 0.0
    profitable_loss_sum = 0.0
    max_profit_loss_sum = 0.0
    rug_loss_sum = 0.0
    
    # For metrics
    all_profitable_preds = []
    all_profitable_true = []
    all_max_profit_preds = []
    all_max_profit_true = []
    all_rug_preds = []
    all_rug_true = []
    
    with torch.no_grad():
        for batch in val_loader:
            candles = batch['candles'].to(device)
            combined = batch['combined'].to(device)
            profitable_true = batch['profitable'].to(device)
            max_profit_true = batch['max_profit'].to(device)
            rug_true = batch['rug_risk'].to(device)
            
            # Forward pass
            profitable_pred, max_profit_pred, rug_pred = model(candles, combined)
            # Compute loss
            loss, p_loss, mp_loss, r_loss = criterion(
                profitable_pred, max_profit_pred, rug_pred,
                profitable_true, max_profit_true, rug_true
            )
            
            # Accumulate losses
            total_loss += loss.item()
            profitable_loss_sum += p_loss.item()
            max_profit_loss_sum += mp_loss.item()
            rug_loss_sum += r_loss.item()
            
            # Store predictions for metrics
            all_profitable_preds.extend(profitable_pred.cpu().numpy())
            all_profitable_true.extend(profitable_true.cpu().numpy())
            all_max_profit_preds.extend(max_profit_pred.cpu().numpy())
            all_max_profit_true.extend(max_profit_true.cpu().numpy())
            all_rug_preds.extend(rug_pred.cpu().numpy())
            all_rug_true.extend(rug_true.cpu().numpy())
    
    num_batches = len(val_loader)
    
    # Calculate metrics
    all_profitable_preds = np.array(all_profitable_preds).flatten()
    all_profitable_true = np.array(all_profitable_true).flatten()
    all_rug_preds = np.array(all_rug_preds).flatten()
    all_rug_true = np.array(all_rug_true).flatten()
    
    # AUC scores
    profitable_auc = roc_auc_score(all_profitable_true, all_profitable_preds)
    rug_auc = roc_auc_score(all_rug_true, all_rug_preds)
    
    # Accuracy
    profitable_acc = ((all_profitable_preds > 0.5) == all_profitable_true).mean()
    rug_acc = ((all_rug_preds > 0.5) == all_rug_true).mean()
    
    # MAE for regression
    all_max_profit_preds = np.array(all_max_profit_preds).flatten()
    all_max_profit_true = np.array(all_max_profit_true).flatten()
    max_profit_mae = np.abs(all_max_profit_preds - all_max_profit_true).mean()
    
    return {
        'loss': {
            'total': total_loss / num_batches,
            'profitable': profitable_loss_sum / num_batches,
            'max_profit': max_profit_loss_sum / num_batches,
            'rug_risk': rug_loss_sum / num_batches
        },
        'metrics': {
            'profitable_auc': profitable_auc,
            'profitable_acc': profitable_acc,
            'rug_auc': rug_auc,
            'rug_acc': rug_acc,
            'max_profit_mae': max_profit_mae
        }
    }


def train_model(model, train_loader, val_loader, class_weights, 
                epochs=100, initial_lr=0.0001, warmup_epochs=10):
    """
    Full training loop with checkpointing and early stopping
    """
    print(f"\n🚀 Starting PyTorch training...")
    print(f"  - Epochs: {epochs}, Batch size: {train_loader.batch_size}")
    print(f"  - Learning rate: {initial_lr} (with warmup and cosine annealing)")
    print(f"  - Gradient clipping: 1.0")
    print(f"  - Class balancing: Enabled")
    print(f"  - Device: {device}")
    
    # Loss function and optimizer
    criterion = WeightedMultiTaskLoss(class_weights)
    optimizer = torch.optim.AdamW(model.parameters(), lr=initial_lr)
    
    # Learning rate scheduler
    lr_lambda = create_lr_schedule(initial_lr, warmup_epochs, epochs)
    scheduler = torch.optim.lr_scheduler.LambdaLR(optimizer, lr_lambda)
    
    # Training history
    history = {
        'train_loss': [],
        'val_loss': [],
        'val_profitable_auc': [],
        'val_profitable_acc': [],
        'val_rug_auc': [],
        'val_rug_acc': [],
        'val_max_profit_mae': [],
        'lr': []
    }
    
    # Early stopping and checkpoint resumption
    best_val_auc = 0.0
    patience = 15
    patience_counter = 0
    best_model_path = os.path.join(ROOT_DIR, 'best_model_pytorch.pth')
    checkpoint_path = os.path.join(ROOT_DIR, 'training_checkpoint.pth')
    start_epoch = 0
    
    # Resume from checkpoint if exists
    if os.path.exists(checkpoint_path):
        print(f"📥 Resuming from checkpoint...")
        checkpoint = torch.load(checkpoint_path, weights_only=False)
        model.load_state_dict(checkpoint['model_state_dict'])
        optimizer.load_state_dict(checkpoint['optimizer_state_dict'])
        start_epoch = checkpoint['epoch'] + 1
        best_val_auc = checkpoint.get('best_val_auc', 0.0)
        history = checkpoint.get('history', history)
        print(f"  Resuming from epoch {start_epoch}, best Val AUC: {best_val_auc:.4f}")
    
    # Training loop
    for epoch in range(start_epoch, epochs):
        # Train
        train_losses = train_epoch(model, train_loader, criterion, optimizer, device)
        
        # Validate
        val_results = validate_epoch(model, val_loader, criterion, device)
        
        # Update learning rate
        current_lr = optimizer.param_groups[0]['lr']
        scheduler.step()
        
        # Store history
        history['train_loss'].append(train_losses['total'])
        history['val_loss'].append(val_results['loss']['total'])
        history['val_profitable_auc'].append(val_results['metrics']['profitable_auc'])
        history['val_profitable_acc'].append(val_results['metrics']['profitable_acc'])
        history['val_rug_auc'].append(val_results['metrics']['rug_auc'])
        history['val_rug_acc'].append(val_results['metrics']['rug_acc'])
        history['val_max_profit_mae'].append(val_results['metrics']['max_profit_mae'])
        history['lr'].append(current_lr)
        
        # Print progress
        print(f"\nEpoch {epoch+1}/{epochs}")
        print(f"  Train Loss: {train_losses['total']:.4f} "
              f"(P: {train_losses['profitable']:.4f}, MP: {train_losses['max_profit']:.4f}, R: {train_losses['rug_risk']:.4f})")
        print(f"  Val Loss: {val_results['loss']['total']:.4f}")
        print(f"  Val Profitable - AUC: {val_results['metrics']['profitable_auc']:.4f}, Acc: {val_results['metrics']['profitable_acc']:.4f}")
        print(f"  Val Rug Risk - AUC: {val_results['metrics']['rug_auc']:.4f}, Acc: {val_results['metrics']['rug_acc']:.4f}")
        print(f"  Val Max Profit MAE: {val_results['metrics']['max_profit_mae']:.4f}")
        print(f"  LR: {current_lr:.6f}")
        
        # Checkpointing and early stopping
        val_auc = val_results['metrics']['profitable_auc']
        if val_auc > best_val_auc:
            best_val_auc = val_auc
            patience_counter = 0
            # Save best model
            torch.save({
                'epoch': epoch,
                'model_state_dict': model.state_dict(),
                'optimizer_state_dict': optimizer.state_dict(),
                'val_auc': val_auc,
                'history': history
            }, best_model_path)
            print(f"  ✅ New best model saved! Val AUC: {val_auc:.4f}")
        else:
            patience_counter += 1
            print(f"  Patience: {patience_counter}/{patience}")
            
            if patience_counter >= patience:
                print(f"\n⚠️ Early stopping triggered after {epoch+1} epochs")
                break
        
        # Save checkpoint every 5 epochs for crash recovery
        if (epoch + 1) % 5 == 0:
            torch.save({
                'epoch': epoch,
                'model_state_dict': model.state_dict(),
                'optimizer_state_dict': optimizer.state_dict(),
                'best_val_auc': best_val_auc,
                'history': history
            }, checkpoint_path)
    
    # Load best model
    print(f"\n📥 Loading best model (Val AUC: {best_val_auc:.4f})...")
    checkpoint = torch.load(best_model_path, weights_only=False)
    model.load_state_dict(checkpoint['model_state_dict'])
    
    # Save training history (convert numpy types to native Python)
    history_path = os.path.join(ROOT_DIR, 'training_history_pytorch.json')
    history_serializable = {k: [float(v) for v in vals] for k, vals in history.items()}
    with open(history_path, 'w') as f:
        json.dump(history_serializable, f, indent=2)
    print(f"✅ Training history saved to {history_path}")
    
    return model, history


def evaluate_model(model, test_loader, device):
    """
    Comprehensive model evaluation on test set
    """
    print("\n📊 Evaluating model on test set...")
    
    model.eval()
    
    all_profitable_preds = []
    all_profitable_true = []
    all_max_profit_preds = []
    all_max_profit_true = []
    all_rug_preds = []
    all_rug_true = []
    
    with torch.no_grad():
        for batch in test_loader:
            candles = batch['candles'].to(device)
            combined = batch['combined'].to(device)
            
            profitable_pred, max_profit_pred, rug_pred = model(candles, combined)
            
            all_profitable_preds.extend(profitable_pred.cpu().numpy())
            all_profitable_true.extend(batch['profitable'].numpy())
            all_max_profit_preds.extend(max_profit_pred.cpu().numpy())
            all_max_profit_true.extend(batch['max_profit'].numpy())
            all_rug_preds.extend(rug_pred.cpu().numpy())
            all_rug_true.extend(batch['rug_risk'].numpy())
    
    # Convert to numpy
    all_profitable_preds = np.array(all_profitable_preds).flatten()
    all_profitable_true = np.array(all_profitable_true).flatten()
    all_max_profit_preds = np.array(all_max_profit_preds).flatten()
    all_max_profit_true = np.array(all_max_profit_true).flatten()
    all_rug_preds = np.array(all_rug_preds).flatten()
    all_rug_true = np.array(all_rug_true).flatten()
    
    # Binary predictions
    profitable_binary = (all_profitable_preds > 0.5).astype(int)
    rug_binary = (all_rug_preds > 0.5).astype(int)
    
    # Metrics
    print("\n📈 Test Results:")
    print(f"  Profitable AUC: {roc_auc_score(all_profitable_true, all_profitable_preds):.4f}")
    print(f"  Profitable Accuracy: {(profitable_binary == all_profitable_true).mean():.4f}")
    print(f"  Rug Risk AUC: {roc_auc_score(all_rug_true, all_rug_preds):.4f}")
    print(f"  Rug Risk Accuracy: {(rug_binary == all_rug_true).mean():.4f}")
    print(f"  Max Profit MAE: {np.abs(all_max_profit_preds - all_max_profit_true).mean():.4f}")
    print(f"  Max Profit MSE: {((all_max_profit_preds - all_max_profit_true) ** 2).mean():.4f}")
    
    print("\n📊 Profitable Prediction Analysis:")
    print(classification_report(all_profitable_true, profitable_binary, 
                                target_names=['Not Profitable', 'Profitable']))
    print("\nConfusion Matrix (Profitable):")
    print(confusion_matrix(all_profitable_true, profitable_binary))
    
    print("\n📊 Rug Risk Prediction Analysis:")
    if len(np.unique(all_rug_true)) > 1:
        print(classification_report(all_rug_true, rug_binary, 
                                    target_names=['Safe', 'Rug']))
        print("\nConfusion Matrix (Rug Risk):")
        print(confusion_matrix(all_rug_true, rug_binary))
    else:
        print("  ⚠️ Test set only contains one class (no rugs detected)")
        print(f"  All predictions: {'Safe' if all_rug_true[0] == 0 else 'Rug'}")
        print(f"  Accuracy: {((rug_binary == all_rug_true).mean()):.4f}")


def export_for_inference(model, output_path='../../model_pytorch_scripted.pt'):
    """
    Export model to TorchScript for TypeScript inference
    """
    print(f"\n📦 Exporting model to TorchScript...")
    
    model.eval()
    model = model.cpu()  # Move to CPU for export
    
    # Example inputs for tracing
    example_candles = torch.randn(1, 100, 5)
    example_combined = torch.randn(1, 18)  # 5 context + 5 indicators + 8 patterns
    
    # Trace the model
    traced_model = torch.jit.trace(model, (example_candles, example_combined))
    
    # Save traced model
    traced_model.save(output_path)
    
    print(f"✅ Model exported to {output_path}")
    print(f"   Format: TorchScript (can be loaded in TypeScript with ONNX Runtime)")


def main():
    """
    Main training pipeline
    """
    print("=" * 60)
    print("🧠 Deep Learning Model Training (PyTorch)")
    print("=" * 60)
    
    # Load preprocessed data
    print("\n📂 Loading preprocessed data...")
    data = np.load(os.path.join(ROOT_DIR, 'processed_data.npz'))
    
    X_train_candles = data['X_train_candles']
    X_train_combined = data['X_train_combined']  # 18 features: context + indicators + patterns
    y_train = data['y_train']
    
    X_val_candles = data['X_val_candles']
    X_val_combined = data['X_val_combined']
    y_val = data['y_val']
    
    X_test_candles = data['X_test_candles']
    X_test_combined = data['X_test_combined']
    y_test = data['y_test']
    
    print(f"✅ Data loaded:")
    print(f"  Train: {len(X_train_candles)} examples")
    print(f"  Val: {len(X_val_candles)} examples")
    print(f"  Test: {len(X_test_candles)} examples")
    
    # Compute class weights
    class_weights = compute_class_weights(y_train)
    
    # Create datasets
    train_dataset = TradingDataset(X_train_candles, X_train_combined, y_train)
    val_dataset = TradingDataset(X_val_candles, X_val_combined, y_val)
    test_dataset = TradingDataset(X_test_candles, X_test_combined, y_test)
    
    # Create dataloaders with parallel loading
    train_loader = DataLoader(train_dataset, batch_size=64, shuffle=True, num_workers=4, pin_memory=True, persistent_workers=True)
    val_loader = DataLoader(val_dataset, batch_size=64, shuffle=False, num_workers=2, pin_memory=True, persistent_workers=True)
    test_loader = DataLoader(test_dataset, batch_size=64, shuffle=False, num_workers=2, pin_memory=True)
    
    # Create model
    print("\n🏗️ Creating model...")
    model = SnipeBTModel().to(device)
    
    total_params = sum(p.numel() for p in model.parameters())
    trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    
    print(f"✅ Model created:")
    print(f"  - Architecture: BiLSTM + Scaled Attention + Residuals")
    print(f"  - Total parameters: {total_params:,}")
    print(f"  - Trainable parameters: {trainable_params:,}")
    
    # Train model
    model, history = train_model(
        model, 
        train_loader, 
        val_loader, 
        class_weights,
        epochs=100,
        initial_lr=0.0001,
        warmup_epochs=10
    )
    
    # Evaluate on test set
    evaluate_model(model, test_loader, device)
    
    # Export for inference
    export_for_inference(model)
    
    print("\n✅ Training pipeline complete!")
    print(f"   Best model: ../../best_model_pytorch.pth")
    print(f"   TorchScript: ../../model_pytorch_scripted.pt")
    print(f"   History: ../../training_history_pytorch.json")


if __name__ == '__main__':
    main()
