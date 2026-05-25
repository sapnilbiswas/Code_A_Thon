import os
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import StandardScaler, OneHotEncoder

class FraudAnomalyDetector:
    def __init__(self):
        self.model = None
        self.preprocessor = None
        self.is_fitted = False
        
        # Calibration boundaries for scores
        self.min_decision_score = 0.0
        self.max_decision_score = 0.0
        
        # Training distribution statistics for explainability
        self.stats = {}

    def fit(self, csv_path):
        if not os.path.exists(csv_path):
            raise FileNotFoundError(f"Training data not found at {csv_path}")

        # Load dataset
        df = pd.read_csv(csv_path)
        
        # Extract features and targets
        X = df[['amount', 'type', 'category', 'hour']]
        
        # Define preprocessing pipeline
        categorical_features = ['type', 'category']
        numeric_features = ['amount', 'hour']
        
        self.preprocessor = ColumnTransformer(
            transformers=[
                ('num', StandardScaler(), numeric_features),
                ('cat', OneHotEncoder(handle_unknown='ignore', sparse_output=False), categorical_features)
            ]
        )
        
        # Preprocess features
        X_processed = self.preprocessor.fit_transform(X)
        
        # Train Isolation Forest
        # Set contamination to match the anomaly percentage in our synthetic dataset (~4%)
        self.model = IsolationForest(contamination=0.04, random_state=42)
        self.model.fit(X_processed)
        
        # Compute decision scores for calibration
        decision_scores = self.model.decision_function(X_processed)
        self.min_decision_score = float(np.min(decision_scores))
        self.max_decision_score = float(np.max(decision_scores))
        
        # Calculate statistics for the explainability layer
        self.stats['overall_mean_amount'] = float(df[df['type'] == 'expense']['amount'].mean())
        self.stats['overall_std_amount'] = float(df[df['type'] == 'expense']['amount'].std())
        
        # Category-specific averages for expenses
        cat_stats = {}
        for cat in df['category'].unique():
            cat_expenses = df[(df['category'] == cat) & (df['type'] == 'expense')]['amount']
            if len(cat_expenses) > 0:
                cat_stats[cat] = {
                    'mean': float(cat_expenses.mean()),
                    'std': float(cat_expenses.std()) if len(cat_expenses) > 1 else 1.0
                }
            else:
                cat_stats[cat] = {'mean': 50.0, 'std': 20.0}
        self.stats['category_stats'] = cat_stats
        
        self.is_fitted = True
        print("🌲 IsolationForest anomaly detector trained successfully!")

    def predict(self, txn_data):
        if not self.is_fitted:
            raise RuntimeError("Model is not fitted. Run fit() first.")
            
        # Parse inputs
        amount = float(txn_data.get('amount', 0))
        type_ = str(txn_data.get('type', 'expense')).lower()
        category = str(txn_data.get('category', 'Other'))
        hour = int(txn_data.get('hour', 12))
        
        # Create single row DataFrame
        input_df = pd.DataFrame([{
            'amount': amount,
            'type': type_,
            'category': category,
            'hour': hour
        }])
        
        # Process and predict
        processed_input = self.preprocessor.transform(input_df)
        
        # Isolation Forest prediction: -1 for anomaly, 1 for normal
        prediction = self.model.predict(processed_input)[0]
        decision_score = self.model.decision_function(processed_input)[0]
        
        # Map decision score to 0.0 - 1.0 fraud probability scale
        # Isolation Forest decision_function returns negative values for anomalies, positive for normal.
        # We calibrate: lower decision score -> higher fraud score
        calibrated_score = 0.0
        if decision_score < 0:
            # Anomaly region: map min_decision_score to 1.0 and 0.0 to 0.5
            val = abs(decision_score) / abs(self.min_decision_score) if self.min_decision_score != 0 else 0
            calibrated_score = 0.5 + (min(val, 1.0) * 0.5)
        else:
            # Normal region: map 0.0 to 0.5 and max_decision_score to 0.0
            val = decision_score / self.max_decision_score if self.max_decision_score != 0 else 0
            calibrated_score = 0.5 * (1.0 - min(val, 1.0))
            
        # Explainability analysis
        reasons = []
        
        # We only flag expenses for fraud (income transactions like Salary are safe)
        if type_ == 'income':
            is_flagged = False
            calibrated_score = 0.0
        else:
            # Hard threshold override: ensure high amount triggers anomaly flag
            is_flagged = bool(prediction == -1 or calibrated_score >= 0.5)
            
            # Rule 1: High Transaction Value Anomaly
            overall_limit = self.stats['overall_mean_amount'] + (2.5 * self.stats['overall_std_amount'])
            if amount > overall_limit:
                reasons.append(f"Unusually high transaction value (${amount:,.2f}) compared to historical average.")
                
            # Rule 2: Category specific deviation
            cat_info = self.stats['category_stats'].get(category)
            if cat_info:
                cat_mean = cat_info['mean']
                if amount > 3.0 * cat_mean:
                    reasons.append(f"Spending on {category} is {int(amount/cat_mean)}x higher than average (${cat_mean:,.2f}).")
            
            # Rule 3: Late night activity
            if hour >= 1 and hour <= 4:
                reasons.append(f"Late-night transaction executed at {hour:02d}:00 AM (typical spending occurs in daytime).")
                
            # Rule 4: Transfer risk factor
            if category == 'Transfer' and amount > 1000:
                reasons.append(f"High-value money transfer flagged for secondary verification.")

            # Fallback if model flagged it but no specific statistics rule caught it
            if is_flagged and len(reasons) == 0:
                reasons.append("Multi-dimensional anomaly detected (unusual combination of category, type, and transaction time).")
            
        return {
            "isFlagged": is_flagged,
            "fraudScore": round(calibrated_score, 4),
            "flagReasons": reasons
        }

    def save(self, filepath):
        data = {
            'model': self.model,
            'preprocessor': self.preprocessor,
            'stats': self.stats,
            'min_decision_score': self.min_decision_score,
            'max_decision_score': self.max_decision_score
        }
        joblib.dump(data, filepath)
        print(f"💾 Model state successfully saved to {filepath}")

    def load(self, filepath):
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"Saved model file not found at {filepath}")
        data = joblib.load(filepath)
        self.model = data['model']
        self.preprocessor = data['preprocessor']
        self.stats = data['stats']
        self.min_decision_score = data['min_decision_score']
        self.max_decision_score = data['max_decision_score']
        self.is_fitted = True
        print(f"🔌 Model state loaded from {filepath}")
