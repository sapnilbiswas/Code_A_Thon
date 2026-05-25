import os
from datetime import datetime
from flask import Flask, request, jsonify
from dateutil import parser

from model import FraudAnomalyDetector
from generate_data import generate_synthetic_data

app = Flask(__name__)

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, 'anomaly_detector.joblib')
DATA_PATH = os.path.join(BASE_DIR, 'sample_data.csv')

# Global detector instance
detector = FraudAnomalyDetector()

def initialize_model():
    """Initializes and trains the ML model on startup if necessary."""
    global detector
    try:
        if os.path.exists(MODEL_PATH):
            print(f"Loading existing model from {MODEL_PATH}...")
            detector.load(MODEL_PATH)
        else:
            print("No trained model found. Preparing training pipeline...")
            if not os.path.exists(DATA_PATH):
                print(f"Training data not found. Generating sample_data.csv...")
                generate_synthetic_data(DATA_PATH)
            
            print(f"Training model on {DATA_PATH}...")
            detector.fit(DATA_PATH)
            detector.save(MODEL_PATH)
    except Exception as e:
        print(f"🚨 Error during model initialization: {str(e)}")

# Initialize model before first request
initialize_model()

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status": "healthy",
        "model_loaded": detector.is_fitted,
        "timestamp": datetime.utcnow().isoformat()
    }), 200

@app.route('/predict', methods=['POST'])
def predict():
    if not detector.is_fitted:
        return jsonify({"error": "ML Model is not trained or loaded yet."}), 503

    data = request.get_json()
    if not data:
        return jsonify({"error": "No input payload received."}), 400

    try:
        # Extract features
        amount = data.get('amount')
        type_ = data.get('type')
        category = data.get('category')
        
        # Validation
        if amount is None or type_ is None or category is None:
            return jsonify({"error": "Missing required fields: amount, type, category"}), 400
            
        try:
            amount = float(amount)
        except ValueError:
            return jsonify({"error": "amount must be a valid number"}), 400

        # Extract hour from date
        hour = 12  # Default
        date_str = data.get('date')
        if date_str:
            try:
                # Parse datetime (handles ISO strings and standard formats)
                dt = parser.parse(str(date_str))
                hour = dt.hour
            except Exception as e:
                print(f"⚠️ Failed to parse date '{date_str}': {str(e)}. Using default hour 12.")
        elif 'hour' in data:
            try:
                hour = int(data['hour'])
            except ValueError:
                pass
                
        # Format payload for prediction
        txn_payload = {
            'amount': amount,
            'type': str(type_).lower(),
            'category': str(category),
            'hour': hour
        }
        
        # Perform inference
        result = detector.predict(txn_payload)
        return jsonify(result), 200

    except Exception as e:
        print(f"🚨 Error during prediction: {str(e)}")
        return jsonify({"error": "An internal error occurred during anomaly detection.", "details": str(e)}), 500

if __name__ == '__main__':
    # Run on port 5001 as specified in roadmap
    port = int(os.environ.get('PORT', 5001))
    app.run(host='0.0.0.0', port=port, debug=False)
