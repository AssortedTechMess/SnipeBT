"""
Deep Learning Model V2: Enhanced LSTM + Scaled Attention
- Scaled dot-product attention (not element-wise)
- Residual connections between layers
- Layer normalization throughout
- Gradient clipping and LR scheduling
- Class imbalance handling
"""

import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers, Model
import numpy as np
import json
import tensorflowjs as tfjs
from datetime import datetime
from sklearn.utils.class_weight import compute_class_weight


class ScaledDotProductAttention(layers.Layer):
    """
    Proper attention mechanism using scaled dot-product
    Based on "Attention Is All You Need" (Vaswani et al., 2017)
    """
    def __init__(self, d_model=128, num_heads=4, **kwargs):
        super(ScaledDotProductAttention, self).__init__(**kwargs)
        self.num_heads = num_heads
        self.d_model = d_model
        
        assert d_model % self.num_heads == 0
        self.depth = d_model // self.num_heads
        
    def build(self, input_shape):
        # Query, Key, Value projection matrices
        self.wq = self.add_weight(
            name='query_weight',
            shape=(input_shape[-1], self.d_model),
            initializer='glorot_uniform',
            trainable=True
        )
        self.wk = self.add_weight(
            name='key_weight',
            shape=(input_shape[-1], self.d_model),
            initializer='glorot_uniform',
            trainable=True
        )
        self.wv = self.add_weight(
            name='value_weight',
            shape=(input_shape[-1], self.d_model),
            initializer='glorot_uniform',
            trainable=True
        )
        self.dense = layers.Dense(input_shape[-1])
        super(ScaledDotProductAttention, self).build(input_shape)
    
    def split_heads(self, x, batch_size):
        """Split last dimension into (num_heads, depth)"""
        x = tf.reshape(x, (batch_size, -1, self.num_heads, self.depth))
        return tf.transpose(x, perm=[0, 2, 1, 3])
    
    def call(self, inputs):
        batch_size = tf.shape(inputs)[0]
        
        # Linear projections
        q = tf.matmul(inputs, self.wq)  # (batch, seq_len, d_model)
        k = tf.matmul(inputs, self.wk)
        v = tf.matmul(inputs, self.wv)
        
        # Split into multiple heads
        q = self.split_heads(q, batch_size)  # (batch, num_heads, seq_len, depth)
        k = self.split_heads(k, batch_size)
        v = self.split_heads(v, batch_size)
        
        # Scaled dot-product attention
        matmul_qk = tf.matmul(q, k, transpose_b=True)  # (batch, num_heads, seq_len, seq_len)
        
        # Scale by sqrt(dk)
        dk = tf.cast(tf.shape(k)[-1], tf.float32)
        scaled_attention_logits = matmul_qk / tf.math.sqrt(dk)
        
        # Softmax to get attention weights
        attention_weights = tf.nn.softmax(scaled_attention_logits, axis=-1)
        
        # Apply attention to values
        output = tf.matmul(attention_weights, v)  # (batch, num_heads, seq_len, depth)
        
        # Concatenate heads
        output = tf.transpose(output, perm=[0, 2, 1, 3])  # (batch, seq_len, num_heads, depth)
        concat_attention = tf.reshape(output, (batch_size, -1, self.d_model))
        
        # Final linear projection
        output = self.dense(concat_attention)
        
        return output
    
    def get_config(self):
        config = super(ScaledDotProductAttention, self).get_config()
        config.update({
            'd_model': self.d_model,
            'num_heads': self.num_heads
        })
        return config


def create_lr_schedule(initial_lr=0.0001, warmup_epochs=10, total_epochs=100):
    """
    Learning rate schedule with warmup and cosine annealing
    """
    def lr_schedule(epoch):
        if epoch < warmup_epochs:
            # Linear warmup
            return initial_lr * (epoch + 1) / warmup_epochs
        else:
            # Cosine annealing
            progress = (epoch - warmup_epochs) / (total_epochs - warmup_epochs)
            return initial_lr * 0.5 * (1 + np.cos(np.pi * progress))
    return lr_schedule


def create_model(input_shapes: dict, batch_size: int = 64) -> Model:
    """
    Create enhanced deep learning model with:
    - Scaled dot-product attention
    - Residual connections
    - Layer normalization
    - Improved architecture
    """
    print("🏗️ Building enhanced model architecture...")
    
    # ===== INPUT LAYERS =====
    
    candles_input = keras.Input(shape=input_shapes['candles'], name='candles_input')
    context_input = keras.Input(shape=input_shapes['context'], name='context_input')
    indicators_input = keras.Input(shape=input_shapes['indicators'], name='indicators_input')
    
    # ===== CANDLE PROCESSING (LSTM + ATTENTION + RESIDUALS) =====
    
    # First BiLSTM layer
    x1 = layers.Bidirectional(
        layers.LSTM(128, return_sequences=True, dropout=0.2, recurrent_dropout=0.1, name='lstm_1')
    )(candles_input)
    x1 = layers.LayerNormalization(name='ln_lstm_1')(x1)
    
    # Second BiLSTM layer with residual connection
    x2 = layers.Bidirectional(
        layers.LSTM(64, return_sequences=True, dropout=0.2, recurrent_dropout=0.1, name='lstm_2')
    )(x1)
    x2 = layers.LayerNormalization(name='ln_lstm_2')(x2)
    
    # Match dimensions for residual (256 from BiLSTM(128) -> 128 from BiLSTM(64))
    x1_projection = layers.Dense(128, name='residual_projection')(x1)
    x2 = layers.Add(name='lstm_residual')([x1_projection, x2])
    
    # Scaled Dot-Product Attention with residual
    attention_out = ScaledDotProductAttention(d_model=128, num_heads=4, name='attention')(x2)
    attention_out = layers.LayerNormalization(name='ln_attention')(attention_out)
    attention_out = layers.Add(name='attention_residual')([x2, attention_out])
    
    # Global average pooling
    candles_features = layers.GlobalAveragePooling1D(name='candles_pool')(attention_out)
    
    # ===== CONTEXT & INDICATORS PROCESSING =====
    
    combined = layers.Concatenate(name='combine_context_indicators')([context_input, indicators_input])
    
    # Deeper context processing with residuals
    context_1 = layers.Dense(128, activation='relu', name='context_dense_1')(combined)
    context_1 = layers.LayerNormalization(name='ln_context_1')(context_1)
    context_1 = layers.Dropout(0.3)(context_1)
    
    context_2 = layers.Dense(64, activation='relu', name='context_dense_2')(context_1)
    context_2 = layers.LayerNormalization(name='ln_context_2')(context_2)
    context_2 = layers.Dropout(0.3)(context_2)
    
    # Residual connection (project to match dimensions)
    context_1_proj = layers.Dense(64, name='context_residual_proj')(context_1)
    context_features = layers.Add(name='context_residual')([context_1_proj, context_2])
    
    # ===== MERGE ALL FEATURES =====
    
    merged = layers.Concatenate(name='merge_all')([candles_features, context_features])
    
    # ===== FULLY CONNECTED LAYERS WITH RESIDUALS =====
    
    fc1 = layers.Dense(256, activation='relu', name='fc_1')(merged)
    fc1 = layers.LayerNormalization(name='ln_fc_1')(fc1)
    fc1 = layers.Dropout(0.4)(fc1)
    
    fc2 = layers.Dense(128, activation='relu', name='fc_2')(fc1)
    fc2 = layers.LayerNormalization(name='ln_fc_2')(fc2)
    fc2 = layers.Dropout(0.3)(fc2)
    
    fc3 = layers.Dense(64, activation='relu', name='fc_3')(fc2)
    fc3 = layers.LayerNormalization(name='ln_fc_3')(fc3)
    fc3 = layers.Dropout(0.3)(fc3)
    
    # ===== OUTPUT LAYERS (MULTI-TASK) =====
    
    profitable_output = layers.Dense(1, activation='sigmoid', name='profitable')(fc3)
    max_profit_output = layers.Dense(1, activation='linear', name='max_profit')(fc3)
    rug_risk_output = layers.Dense(1, activation='sigmoid', name='rug_risk')(fc3)
    
    # ===== CREATE MODEL =====
    
    model = Model(
        inputs=[candles_input, context_input, indicators_input],
        outputs=[profitable_output, max_profit_output, rug_risk_output],
        name='SnipeBT_DeepLearning_V2'
    )
    
    print(f"✅ Enhanced model created:")
    print(f"  - Architecture: BiLSTM + Scaled Attention + Residuals")
    print(f"  - Total parameters: {model.count_params():,}")
    print(f"  - Trainable parameters: {sum([tf.size(w).numpy() for w in model.trainable_weights]):,}")
    
    return model


def compile_model_with_class_weights(model: Model, y_train: np.ndarray):
    """
    Compile model with class weights to handle imbalance
    """
    # Calculate class weights for 'profitable' label
    class_weights_profitable = compute_class_weight(
        class_weight='balanced',
        classes=np.unique(y_train[:, 0]),
        y=y_train[:, 0]
    )
    
    class_weights_rug = compute_class_weight(
        class_weight='balanced',
        classes=np.unique(y_train[:, 2]),
        y=y_train[:, 2]
    )
    
    print(f"📊 Class weights calculated:")
    print(f"  Profitable: {dict(enumerate(class_weights_profitable))}")
    print(f"  Rug Risk: {dict(enumerate(class_weights_rug))}")
    
    # Compile with gradient clipping
    model.compile(
        optimizer=keras.optimizers.Adam(
            learning_rate=0.0001,
            clipnorm=1.0  # Gradient clipping to prevent exploding gradients
        ),
        loss={
            'profitable': 'binary_crossentropy',
            'max_profit': 'mse',
            'rug_risk': 'binary_crossentropy'
        },
        loss_weights={
            'profitable': 1.0,
            'max_profit': 0.5,
            'rug_risk': 1.0
        },
        metrics={
            'profitable': ['accuracy', keras.metrics.AUC(name='auc'), keras.metrics.Precision(name='precision'), keras.metrics.Recall(name='recall')],
            'max_profit': ['mae', 'mse'],
            'rug_risk': ['accuracy', keras.metrics.AUC(name='auc')]
        }
    )
    
    return {
        'profitable': dict(enumerate(class_weights_profitable)),
        'rug_risk': dict(enumerate(class_weights_rug))
    }


def train_model(model: Model, X_train: dict, y_train: np.ndarray, 
                X_val: dict, y_val: np.ndarray, 
                class_weights: dict,
                epochs: int = 100, batch_size: int = 64):
    """
    Train model with enhanced callbacks and class weights
    """
    print(f"\n🚀 Starting enhanced training...")
    print(f"  - Epochs: {epochs}, Batch size: {batch_size}")
    print(f"  - Learning rate: Warmup + Cosine annealing")
    print(f"  - Gradient clipping: 1.0")
    print(f"  - Class balancing: Enabled")
    print(f"🎮 GPU: {tf.config.list_physical_devices('GPU')}")
    
    # Enhanced callbacks
    callbacks = [
        # Model checkpoint
        keras.callbacks.ModelCheckpoint(
            filepath='../../best_model_v2.keras',
            monitor='val_profitable_auc',
            mode='max',
            save_best_only=True,
            verbose=1
        ),
        
        # Early stopping with patience
        keras.callbacks.EarlyStopping(
            monitor='val_profitable_auc',
            patience=15,
            mode='max',
            restore_best_weights=True,
            verbose=1
        ),
        
        # Learning rate schedule
        keras.callbacks.LearningRateScheduler(
            create_lr_schedule(initial_lr=0.0001, warmup_epochs=10, total_epochs=epochs),
            verbose=1
        ),
        
        # Reduce LR on plateau (backup)
        keras.callbacks.ReduceLROnPlateau(
            monitor='val_loss',
            factor=0.5,
            patience=5,
            min_lr=1e-7,
            verbose=1
        ),
        
        # TensorBoard
        keras.callbacks.TensorBoard(
            log_dir=f'../../logs/tensorboard_v2_{datetime.now().strftime("%Y%m%d_%H%M%S")}',
            histogram_freq=1,
            write_graph=True,
            update_freq='epoch'
        ),
        
        # CSV logger
        keras.callbacks.CSVLogger(
            filename='../../training_log_v2.csv',
            separator=',',
            append=False
        )
    ]
    
    # Prepare inputs
    X_train_inputs = [X_train['candles'], X_train['context'], X_train['indicators']]
    X_val_inputs = [X_val['candles'], X_val['context'], X_val['indicators']]
    
    # Prepare outputs with class weights
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
    
    # Create sample weights for class balancing
    sample_weight_profitable = np.array([class_weights['profitable'][int(y)] for y in y_train[:, 0]])
    sample_weight_rug = np.array([class_weights['rug_risk'][int(y)] for y in y_train[:, 2]])
    
    sample_weights = {
        'profitable': sample_weight_profitable,
        'max_profit': np.ones(len(y_train)),  # No weighting for regression
        'rug_risk': sample_weight_rug
    }
    
    # Train with mixed precision for speed
    keras.mixed_precision.set_global_policy('mixed_float16')
    
    history = model.fit(
        X_train_inputs,
        y_train_outputs,
        validation_data=(X_val_inputs, y_val_outputs),
        epochs=epochs,
        batch_size=batch_size,
        callbacks=callbacks,
        sample_weight=sample_weights,
        verbose=1
    )
    
    # Reset to float32
    keras.mixed_precision.set_global_policy('float32')
    
    # Save training history
    with open('../../training_history_v2.json', 'w') as f:
        json.dump({
            'history': {k: [float(v) for v in vals] for k, vals in history.history.items()},
            'params': history.params,
            'class_weights': class_weights
        }, f, indent=2)
    
    print("\n✅ Enhanced training complete!")
    return history


def evaluate_model(model: Model, X_test: dict, y_test: np.ndarray):
    """
    Comprehensive model evaluation
    """
    print("\n📊 Evaluating enhanced model on test set...")
    
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
    
    # Additional analysis
    predictions = model.predict(X_test_inputs)
    profitable_preds = (predictions[0] > 0.5).astype(int).flatten()
    rug_preds = (predictions[2] > 0.5).astype(int).flatten()
    
    from sklearn.metrics import classification_report, confusion_matrix
    
    print("\n📊 Profitable Prediction Analysis:")
    print(classification_report(y_test[:, 0], profitable_preds, target_names=['Not Profitable', 'Profitable']))
    print("\nConfusion Matrix (Profitable):")
    print(confusion_matrix(y_test[:, 0], profitable_preds))
    
    print("\n📊 Rug Risk Prediction Analysis:")
    print(classification_report(y_test[:, 2], rug_preds, target_names=['Safe', 'Rug']))
    print("\nConfusion Matrix (Rug Risk):")
    print(confusion_matrix(y_test[:, 2], rug_preds))
    
    return results


def export_for_inference(model: Model, output_dir: str = '../../tfjs_model_v2'):
    """
    Export enhanced model to TensorFlow.js
    """
    print(f"\n📦 Exporting enhanced model...")
    
    tfjs.converters.save_keras_model(model, output_dir)
    
    print(f"✅ Model exported to {output_dir}")
    print(f"   Features: Scaled Attention, Residuals, Layer Norm")


def main():
    """
    Main training pipeline for enhanced model
    """
    print("=" * 60)
    print("🧠 Deep Learning Model Training V2 (Enhanced)")
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
    
    # Create enhanced model
    input_shapes = {
        'candles': (100, 5),
        'context': (5,),
        'indicators': (5,)
    }
    
    model = create_model(input_shapes, batch_size=64)
    
    # Compile with class weights
    class_weights = compile_model_with_class_weights(model, y_train)
    
    # Print model summary
    model.summary()
    
    # Train model
    history = train_model(
        model, 
        X_train, y_train, 
        X_val, y_val,
        class_weights,
        epochs=100,
        batch_size=64
    )
    
    # Evaluate on test set
    evaluate_model(model, X_test, y_test)
    
    # Export for inference
    export_for_inference(model)
    
    print("\n" + "=" * 60)
    print("✅ Enhanced training pipeline complete!")
    print("📈 Improvements: Scaled Attention + Residuals + LR Schedule + Class Balance")
    print("=" * 60)


if __name__ == '__main__':
    main()
