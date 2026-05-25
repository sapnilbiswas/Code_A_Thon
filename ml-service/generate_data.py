import csv
import random
import os

def generate_synthetic_data(filepath, num_records=1000):
    categories = ['Groceries', 'Rent', 'Entertainment', 'Transfer', 'Salary', 'Other']
    types = ['income', 'expense']
    
    with open(filepath, mode='w', newline='') as file:
        writer = csv.writer(file)
        writer.writerow(['amount', 'type', 'category', 'hour', 'is_anomaly'])
        
        # Generate normal records (96% of the data)
        for _ in range(int(num_records * 0.96)):
            category = random.choices(categories, weights=[0.35, 0.05, 0.25, 0.15, 0.05, 0.15])[0]
            hour = int(random.gauss(15, 4)) % 24  # normally distributed around 3 PM
            if hour < 0:
                hour = 0
            elif hour > 23:
                hour = 23
                
            if category == 'Salary':
                amount = round(random.uniform(3000, 8000), 2)
                type_ = 'income'
                # Salary typically during business hours
                hour = random.randint(9, 17)
            elif category == 'Rent':
                amount = round(random.uniform(1200, 2500), 2)
                type_ = 'expense'
                hour = random.randint(9, 18)
            elif category == 'Groceries':
                amount = round(random.uniform(15, 250), 2)
                type_ = 'expense'
                # Shopping typically daytime/evening
                hour = random.randint(8, 21)
            elif category == 'Entertainment':
                amount = round(random.uniform(10, 150), 2)
                type_ = 'expense'
                # Entertainment can go late, but usually small/moderate amounts
                hour = random.choices([random.randint(12, 23), random.randint(0, 2)], weights=[0.8, 0.2])[0]
            elif category == 'Transfer':
                amount = round(random.uniform(20, 500), 2)
                type_ = random.choice(['income', 'expense'])
                hour = random.randint(8, 20)
            else:  # Other
                amount = round(random.uniform(5, 120), 2)
                type_ = 'expense'
                hour = random.randint(8, 22)
                
            writer.writerow([amount, type_, category, hour, 0])
            
        # Generate anomalous records (4% of the data)
        for _ in range(int(num_records * 0.04)):
            # Anomaly Type 1: High transfer at late night
            anomaly_type = random.choice(['high_transfer_night', 'high_entertainment_night', 'huge_expense_day'])
            
            if anomaly_type == 'high_transfer_night':
                amount = round(random.uniform(4000, 9999), 2)
                category = 'Transfer'
                type_ = 'expense'
                hour = random.randint(1, 4)  # 1 AM to 4 AM
            elif anomaly_type == 'high_entertainment_night':
                amount = round(random.uniform(2500, 6000), 2)
                category = 'Entertainment'
                type_ = 'expense'
                hour = random.randint(2, 5)  # 2 AM to 5 AM
            else:  # huge_expense_day
                amount = round(random.uniform(8000, 15000), 2)
                category = random.choice(['Groceries', 'Other', 'Entertainment'])
                type_ = 'expense'
                hour = random.randint(10, 18)
                
            writer.writerow([amount, type_, category, hour, 1])

    print(f"✅ Generated {num_records} synthetic transactions at {filepath}")

if __name__ == '__main__':
    script_dir = os.path.dirname(os.path.abspath(__file__))
    generate_synthetic_data(os.path.join(script_dir, 'sample_data.csv'))
