import json
import urllib.request
import os
import sys

def test_direct_model():
    print("--------------------------------------------------")
    print("🧪 Testing FraudAnomalyDetector class directly...")
    print("--------------------------------------------------")
    try:
        from model import FraudAnomalyDetector
        detector = FraudAnomalyDetector()
        
        # Paths
        base_dir = os.path.dirname(os.path.abspath(__file__))
        data_path = os.path.join(base_dir, 'sample_data.csv')
        model_path = os.path.join(base_dir, 'anomaly_detector.joblib')
        
        # Load or train
        if os.path.exists(model_path):
            detector.load(model_path)
        else:
            detector.fit(data_path)
            detector.save(model_path)
            
        scenarios = [
            {
                "name": "Normal Grocery Expense",
                "data": {"amount": 42.50, "type": "expense", "category": "Groceries", "hour": 14}
            },
            {
                "name": "Normal Salary Deposit",
                "data": {"amount": 5500.00, "type": "income", "category": "Salary", "hour": 10}
            },
            {
                "name": "Late-Night Medium Transfer",
                "data": {"amount": 450.00, "type": "expense", "category": "Transfer", "hour": 18}
            },
            {
                "name": "Suspicious Huge Transfer at 3 AM",
                "data": {"amount": 8750.00, "type": "expense", "category": "Transfer", "hour": 3}
            },
            {
                "name": "Unusual High Grocery Purchase",
                "data": {"amount": 1800.00, "type": "expense", "category": "Groceries", "hour": 12}
            }
        ]
        
        for case in scenarios:
            res = detector.predict(case["data"])
            print(f"\n👉 Case: {case['name']}")
            print(f"   Input: {case['data']}")
            print(f"   Fraud Score: {res['fraudScore']:.4f} | Flagged: {res['isFlagged']}")
            print(f"   Reasons: {res['flagReasons']}")
            
            # Basic sanity checks
            if case["name"] == "Normal Grocery Expense" and res["isFlagged"]:
                print("❌ ERROR: Normal groceries shouldn't be flagged!")
            if "3 AM" in case["name"] and not res["isFlagged"]:
                print("❌ ERROR: Late-night huge transfer should be flagged!")
                
        print("\n✅ Direct model test complete!")
    except Exception as e:
        print(f"❌ Error testing model directly: {str(e)}")
        sys.exit(1)

def test_flask_endpoint():
    print("\n--------------------------------------------------")
    print("🧪 Testing Flask HTTP endpoint (/predict)...")
    print("--------------------------------------------------")
    url = "http://localhost:5001/predict"
    test_payload = {
        "amount": 9500.00,
        "type": "expense",
        "category": "Transfer",
        "date": "2026-05-25T03:15:00.000Z"
    }
    
    req = urllib.request.Request(
        url, 
        data=json.dumps(test_payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            res_body = response.read().decode('utf-8')
            res_json = json.loads(res_body)
            print(f"🟢 Success response from {url}:")
            print(json.dumps(res_json, indent=2))
            print("\n✅ Flask API verification completed successfully!")
    except urllib.error.URLError as e:
        print(f"⚠️ Could not reach Flask service at {url}. Is it running?")
        print("   If you haven't started it yet, run: python app.py")
        print("   (This is normal if the server is offline)")
    except Exception as e:
        print(f"❌ Error testing endpoint: {str(e)}")

if __name__ == '__main__':
    test_direct_model()
    # If a command line arg '--endpoint' is passed, test the web service
    if len(sys.argv) > 1 and sys.argv[1] == '--endpoint':
        test_flask_endpoint()
