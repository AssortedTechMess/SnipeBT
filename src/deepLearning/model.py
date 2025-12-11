"""
Deep Learning Model: Bidirectional LSTM + Custom Attention
Predicts profitable trades, max profit, and rug risk
"""

import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers, Model
import numpy as np
import json
import tensorflowjs as tfjs
from datetime import datetime


class AttentionLayer(layers.Layer):
    """
    Custom Attention mechanism for time-series
    Learns which candles are most important for prediction
    """
    def __init__(self, **kwargs):
        super(AttentionLayer, self).__init__(**kwargs)
    
    def build(self, input_shape):
        self.W = self.add_weight(
            name='attention_weight',
            shape=(input_shape[-1], input_shape[-1]),
            initializer='glorot_uniform',
            trainable=True
        )
        self.b = self.add_weight(
            name='attention_bias',
            shape=(input_shape[-1],),
            initializer='zeros',
            trainable=True
        )
        super(AttentionLayer, self).build(input_shape)
    
    def call(self, inputs):
        # inputs shape: (batch_size, timesteps, features)
        
        # Calculate attention scores
        e = tf.tanh(tf.matmul(inputs, self.W) + self.b)  # (batch, timesteps, features)
        a = tf.nn.softmax(e, axis=1)  # (batch, timesteps, features)
        
        # Apply attention weights
        output = inputs * a  # Element-wise multiplication
        
        return output
    
    def get_config(self):
        return super(AttentionLayer, self).get_config()


def create_model(input_shapes: dict, batch_size: int = 64) -> Model:
    """
    Create the deep learning model
    
    Args:
        input_shapes: Dict with keys 'candles', 'context', 'indicators'
        batch_size: Batch size for training (optimized for GTX 1660)
    
    Returns:
        Compiled Keras model
    """
    print("🏗️ Building model architecture...")
    
    # ===== INPUT LAYERS =====
    
    # Candles: (100, 5) - OHLCV time-series
    candles_input = keras.Input(shape=input_shapes['candles'], name='candles_input')
    
    # Context: (5,) - Liquidity, market cap, holders, age, volume
    context_input = keras.Input(shape=input_shapes['context'], name='context_input')
    
    # Indicators: (5,) - RSI, MACD, EMAs, Bollinger width
    indicators_input = keras.Input(shape=input_shapes['indicators'], name='indicators_input')
    
    # ===== CANDLE PROCESSING (LSTM + ATTENTION) =====
    
    # Bidirectional LSTM for temporal patterns
    x = layers.Bidirectional(
        layers.LSTM(128, return_sequences=True, dropout=0.2, name='lstm_1')
    )(candles_input)
    
    # Second LSTM layer
    x = layers.Bidirectional(
        layers.LSTM(64, return_sequences=True, dropout=0.2, name='lstm_2')
    )(x)
    
    # Custom Attention layer
    x = AttentionLayer(name='attention')(x)
    
    # Global average pooling to get fixed-size output
    candles_features = layers.GlobalAveragePooling1D(name='candles_pool')(x)
    
    # ===== CONTEXT & INDICATORS PROCESSING =====
    
    # Combine context and indicators
    combined = layers.Concatenate(name='combine_context_indicators')([context_input, indicators_input])
    
    # Dense layers for context/indicators
    context_features = layers.Dense(64, activation='relu', name='context_dense_1')(combined)
    context_features = layers.Dropout(0.3)(context_features)
    context_features = layers.Dense(32, activation='relu', name='context_dense_2')(context_features)
    
    # ===== MERGE ALL FEATURES =====
    
    merged = layers.Concatenate(name='merge_all')([candles_features, context_features])
    
    # ===== FULLY CONNECTED LAYERS =====
    
    # Deep dense layers with batch normalization
    x = layers.Dense(256, activation='relu', name='fc_1')(merged)
    x = layers.BatchNormalization(name='bn_1')(x)
    x = layers.Dropout(0.4)(x)
    
    x = layers.Dense(128, activation='relu', name='fc_2')(x)
    x = layers.BatchNormalization(name='bn_2')(x)
    x = layers.Dropout(0.3)(x)
    
    x = layers.Dense(64, activation='relu', name='fc_3')(x)
    x = layers.Dropout(0.3)(x)
    
    # ===== OUTPUT LAYERS (MULTI-TASK) =====
    
    # Output 1: Profitable (binary classification)
    profitable_output = layers.Dense(1, activation='sigmoid', name='profitable')(x)
    
    # Output 2: Max Profit (regression)
    max_profit_output = layers.Dense(1, activation='linear', name='max_profit')(x)
    
    # Output 3: Rug Risk (binary classification)
    rug_risk_output = layers.Dense(1, activation='sigmoid', name='rug_risk')(x)
    
    # ===== CREATE MODEL =====
    
    model = Model(
        inputs=[candles_input, context_input, indicators_input],
        outputs=[profitable_output, max_profit_output, rug_risk_output],
        name='SnipeBT_DeepLearning'
    )
    
    # ===== COMPILE MODEL =====
    
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=0.0001),
        loss={
            'profitable': 'binary_crossentropy',
            'max_profit': 'mse',
            'rug_risk': 'binary_crossentropy'
        },
        loss_weights={
            'profitable': 1.0,  # Most important
            'max_profit': 0.5,  # Somewhat important
            'rug_risk': 1.0     # Very important (avoid rugs)
        },
        metrics={
            'profitable': ['accuracy', keras.metrics.AUC(name='auc')],
            'max_profit': ['mae'],
            'rug_risk': ['accuracy', keras.metrics.AUC(name='auc')]
        }
    )
    
    print(f"✅ Model created:")
    print(f"  - Total parameters: {model.count_params():,}")
    print(f"  - Trainable parameters: {sum([tf.size(w).numpy() for w in model.trainable_weights]):,}")
    
    return model


def train_model(model: Model, X_train: dict, y_train: np.ndarray, 
                X_val: dict, y_val: np.ndarray, 
                epochs: int = 100, batch_size: int = 64):
    """
    Train the model with callbacks
    
    Args:
        model: Compiled Keras model
        X_train, y_train: Training data
        X_val, y_val: Validation data
        epochs: Number of training epochs
        batch_size: Batch size (64 optimized for GTX 1660)
    """
    print(f"\n🚀 Starting training (epochs={epochs}, batch_size={batch_size})...")
    print(f"🎮 GPU: {tf.config.list_physical_devices('GPU')}")
    
    # Callbacks
    callbacks = [
        # Save best model
        keras.callbacks.ModelCheckpoint(
            filepath='../../best_model.keras',
            monitor='val_profitable_auc',
            mode='max',
            save_best_only=True,
            verbose=1
        ),
        
        # Early stopping
        keras.callbacks.EarlyStopping(
            monitor='val_profitable_auc',
            patience=15,
            mode='max',
            restore_best_weights=True,
            verbose=1
        ),
        
        # Reduce learning rate on plateau
        keras.callbacks.ReduceLROnPlateau(
            monitor='val_loss',
            factor=0.5,
            patience=5,
            min_lr=1e-7,
            verbose=1
        ),
        
        # TensorBoard logging
        keras.callbacks.TensorBoard(
            log_dir=f'../../logs/tensorboard_{datetime.now().strftime("%Y%m%d_%H%M%S")}',
            histogram_freq=1
        )
    ]
    
    # Prepare inputs
    X_train_inputs = [X_train['candles'], X_train['context'], X_train['indicators']]
    X_val_inputs = [X_val['candles'], X_val['context'], X_val['indicators']]
    
    # Prepare outputs (split multi-task labels)
    y_train_outputs = {
        'profitable': y_train[:, 0],
        'max_profit': y_train[:, 1],
        'rug_risk': y_train[:, 2]
    }
    y_val_outputs = {
        'profitable': y_val[:, 0],
        'max_profit': y_val[:, 1],
        'rug_risk': y_val[:, 2]
    }
    
    # Train
    history = model.fit(
        X_train_inputs,
        y_train_outputs,
        validation_data=(X_val_inputs, y_val_outputs),
        epochs=epochs,
        batch_size=batch_size,
        callbacks=callbacks,
        verbose=1
    )
    
    # Save training history
    with open('../../training_history.json', 'w') as f:
        json.dump({
            'history': {k: [float(v) for v in vals] for k, vals in history.history.items()},
            'params': history.params,
        }, f, indent=2)
    
    print("\n✅ Training complete!")
    return history


def evaluate_model(model: Model, X_test: dict, y_test: np.ndarray):
    """
    Evaluate model on test set
    """
    print("\n📊 Evaluating model on test set...")
    
    X_test_inputs = [X_test['candles'], X_test['context'], X_test['indicators']]
    y_test_outputs = {
        'profitable': y_test[:, 0],
        'max_profit': y_test[:, 1],
        'rug_risk': y_test[:, 2]
    }
    
    results = model.evaluate(X_test_inputs, y_test_outputs, verbose=1)
    
    print("\n📈 Test Results:")
    for i, metric_name in enumerate(model.metrics_names):
        print(f"  {metric_name}: {results[i]:.4f}")
    
    return results


def export_for_inference(model: Model, output_dir: str = '../../tfjs_model'):
    """
    Export model to TensorFlow.js format for bot integration
    """
    print(f"\n📦 Exporting model to TensorFlow.js format...")
    
    tfjs.converters.save_keras_model(model, output_dir)
    
    print(f"✅ Model exported to {output_dir}")
    print(f"   Use this in inference.ts with tf.loadLayersModel()")


def main():
    """
    Main training pipeline
    """
    print("=" * 60)
    print("🧠 Deep Learning Model Training")
    print("=" * 60)
    
    # Load preprocessed data
    print("\n📂 Loading preprocessed data...")
    data = np.load('../../processed_data.npz')
    
    X_train = {
        'candles': data['X_train_candles'],
        'context': data['X_train_context'],
        'indicators': data['X_train_indicators']
    }
    X_val = {
        'candles': data['X_val_candles'],
        'context': data['X_val_context'],
        'indicators': data['X_val_indicators']
    }
    X_test = {
        'candles': data['X_test_candles'],
        'context': data['X_test_context'],
        'indicators': data['X_test_indicators']
    }
    
    y_train = data['y_train']
    y_val = data['y_val']
    y_test = data['y_test']
    
    print(f"✅ Data loaded:")
    print(f"  Train: {len(y_train):,} examples")
    print(f"  Val:   {len(y_val):,} examples")
    print(f"  Test:  {len(y_test):,} examples")
    
    # Create model
    input_shapes = {
        'candles': (100, 5),
        'context': (5,),
        'indicators': (5,)
    }
    
    model = create_model(input_shapes, batch_size=64)
    
    # Print model summary
    model.summary()
    
    # Train model
    history = train_model(
        model, 
        X_train, y_train, 
        X_val, y_val,
        epochs=100,
        batch_size=64
    )
    
    # Evaluate on test set
    evaluate_model(model, X_test, y_test)
    
    # Export for inference
    export_for_inference(model)
    
    print("\n" + "=" * 60)
    print("✅ Training pipeline complete!")
    print("=" * 60)


if __name__ == '__main__':
    main()
