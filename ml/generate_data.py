"""Builds the labelled bank-statement dataset used to train the transaction categoriser.

Each row is a raw statement line (the way banks and card processors print them: card prefixes,
reference numbers, city names, upper/lower case, truncation, typos) and its category.
Merchants are split into train / test groups so the test score measures how well the model
handles merchants it has never seen, not memorised names.
"""
import csv, random, re, sys
random.seed(42)

MERCHANTS = {
  "Groceries": ["Imtiaz Supermarket", "Carrefour Hypermarket", "Al-Fatah Store", "Chase Up Mart", "Metro Cash and Carry", "Naheed Supermarket", "Greenvalley Grocers", "Hyperstar", "Tesco Express", "Aldi", "Lidl", "Whole Foods Market", "Fresh Basket", "Daily Needs Mart", "Bakers Inn Bakery", "Sasta Bazaar Grocery", "Springs Stores", "Esajee Grocery", "Trader Joes", "Walmart Grocery", "Kroger", "Sainsburys", "Safeway", "Organic Corner", "Village Fresh Mart", "Utility Stores Corp", "Jalal Sons Bakery", "Gourmet Bakers", "Farm Fresh Dairy", "Al Madina Mart"],
  "Dining": ["KFC", "McDonalds", "Pizza Hut", "Dominos Pizza", "Burger Lab", "Kababjees", "Butlers Chocolate Cafe", "Starbucks Coffee", "Gloria Jeans Coffees", "Cafe Aylanto", "Monal Restaurant", "Foodpanda Order", "Cheezious", "Subway Sandwiches", "Hardees", "Johnny Rockets", "Nandos", "Coffee Wagera", "Tim Hortons", "Chaaye Khana", "Howdy Burgers", "Salt n Pepper Restaurant", "Bundu Khan", "Savour Foods", "Chinatown Restaurant", "Costa Coffee", "Dunkin Donuts", "Uber Eats", "Deliveroo", "Pret A Manger"],
  "Transport": ["Uber Trip", "Careem Ride", "inDrive", "Bykea", "PSO Petrol Station", "Shell Fuel", "Total Parco Fuel", "Attock Petroleum", "Metro Bus Card", "Orange Line Metro", "Daewoo Express", "Faisal Movers", "Lyft Ride", "Bolt Ride", "BP Fuel Station", "National Rail", "Transport for London", "Motorway Toll Plaza", "City Parking", "Airport Taxi Service", "Hascol Petrol", "Go Petroleum", "Shell Select Fuel", "Yango Taxi", "Swvl Bus"],
  "Bills": ["K-Electric Bill", "LESCO Electricity", "IESCO Bill Payment", "SSGC Gas Bill", "SNGPL Gas", "PTCL Internet", "Nayatel Broadband", "StormFiber Internet", "Jazz Postpaid Bill", "Zong Bill Payment", "Telenor Postpaid", "Ufone Bill", "Karachi Water Board", "WASA Water Bill", "British Gas", "Verizon Wireless", "AT&T Bill", "Comcast Xfinity", "Thames Water", "EE Mobile", "Vodafone Bill", "Wateen Internet", "Transworld Fiber", "Property Tax Excise", "Home Insurance Premium"],
  "Health": ["Shaheen Chemist", "D-Watson Pharmacy", "Servaid Pharmacy", "Clinix Pharmacy", "Aga Khan Hospital", "Shaukat Khanum Hospital", "Chughtai Lab", "Excel Labs", "Dr Ahmed Clinic", "Fazal Din Pharma", "Boots Pharmacy", "CVS Pharmacy", "Walgreens", "City Dental Care", "Vision Eye Clinic", "South City Hospital", "Liaquat National Hospital", "Medicare Pharmacy", "Getz Pharma Store", "Healthwire Consultation", "Marham Doctor Fee", "Oladoc Appointment", "Islamabad Diagnostic Centre", "Physio Plus Clinic"],
  "Entertainment": ["Netflix Subscription", "Spotify Premium", "Cinepax Cinema", "Nueplex Cinemas", "Universal Cinemas", "YouTube Premium", "Disney Plus", "Amazon Prime Video", "Steam Games", "PlayStation Store", "Xbox Live", "Apple Music", "Tapmad", "Shahid VIP", "Concert Tickets Bookme", "Ticketmaster", "Bowling Arena", "Jungle World Play", "Sindbad Wonderland", "Arena Gaming Zone", "Atrium Cinemas", "Vue Cinema", "Odeon Cinemas", "Epic Games Store", "Nintendo eShop"],
  "Shopping": ["Daraz Online Order", "Amazon Marketplace", "Khaadi", "Sapphire", "Gul Ahmed Ideas", "J. Junaid Jamshed", "Outfitters", "Breakout", "Bata Shoes", "Servis Shoes", "Ikea", "Interwood Furniture", "Hush Puppies", "Zara", "H&M", "Uniqlo", "Ebay Purchase", "AliExpress", "Temu Order", "Telemart Online", "Mega.pk", "Dolmen Mall", "Packages Mall", "Lucky One Mall", "Liberty Books", "Saeed Book Bank", "Apple Store", "Samsung Store"],
  "Income": ["Salary Credit", "Payroll Deposit", "Monthly Salary", "Freelance Payment Upwork", "Fiverr Withdrawal", "Payoneer Transfer In", "Invoice Payment Received", "Client Payment", "Dividend Credit", "Profit on Savings", "Tax Refund", "Refund Received", "Bonus Credit", "Rental Income", "Commission Received", "Interest Credit", "Stipend Credit", "Wise Transfer In", "Bank Profit Credit", "Cashback Credit"],
  "Transfers": ["Transfer to Savings", "IBFT Transfer", "Raast Transfer", "Easypaisa Transfer", "JazzCash Transfer", "Own Account Transfer", "Fund Transfer to", "Credit Card Payment", "Loan Installment", "ATM Cash Withdrawal", "Cash Withdrawal ATM", "Standing Order Transfer", "Remittance Sent", "Western Union Send", "Zelle Payment", "Venmo Transfer", "PayPal Transfer", "Inter Bank Funds Transfer", "Wallet Top Up", "Mobile Wallet Load"],
}
CITIES = ["KARACHI", "LAHORE", "ISLAMABAD", "RAWALPINDI", "HYDERABAD", "FAISALABAD", "MULTAN", "PESHAWAR", "LONDON", "DUBAI", "NEW YORK", ""]
PREFIX = ["POS ", "POS PURCHASE ", "CARD ", "VISA ", "MC ", "DEBIT CARD ", "ONLINE ", "ECOM ", "", "", "", "IB ", "MB ", "TXN "]
SUFFIX = ["", "", " REF{n}", " #{n}", " TRX{n}", " ID {n}", " {city}", " {city} PK", " AUTH {n}", " {d}/{m}"]

def typo(s):
    if len(s) < 6 or random.random() > 0.15: return s
    i = random.randrange(1, len(s) - 1)
    op = random.choice(["drop", "swap", "dup"])
    if op == "drop": return s[:i] + s[i + 1:]
    if op == "swap": return s[:i] + s[i + 1] + s[i] + s[i + 2:]
    return s[:i] + s[i] + s[i:]

# Card networks attach a merchant category (MCC) description to many statement lines.
MCC = {"Groceries": ["GROCERY STORES", "SUPERMARKETS", "BAKERIES", "FOOD STORES"], "Dining": ["EATING PLACES", "RESTAURANTS", "FAST FOOD", "CAFES"],
       "Transport": ["SERVICE STATIONS", "TAXICABS", "TRANSIT", "PARKING", "RIDESHARE"], "Bills": ["UTILITIES", "TELECOM SERVICES", "CABLE AND INTERNET", "INSURANCE"],
       "Health": ["DRUG STORES", "PHARMACIES", "MEDICAL SERVICES", "HOSPITALS", "DENTISTS"], "Entertainment": ["DIGITAL MEDIA", "MOTION PICTURE THEATERS", "STREAMING", "AMUSEMENT"],
       "Shopping": ["CLOTHING STORES", "DEPARTMENT STORES", "ELECTRONICS", "MISC RETAIL", "BOOK STORES", "SHOE STORES"], "Income": ["CREDIT", "DEPOSIT"], "Transfers": ["TRANSFER", "FUNDS TRANSFER"]}

def line(merchant, cat=None):
    s = typo(merchant)
    if random.random() < 0.25: s = s.split()[0] + (" " + s.split()[1] if len(s.split()) > 1 and random.random() < 0.6 else "")
    s = random.choice(PREFIX) + s + random.choice(SUFFIX).format(n=random.randint(1000, 999999), city=random.choice(CITIES), d=random.randint(1, 28), m=random.randint(1, 12))
    if cat and random.random() < 0.35: s += " " + random.choice(MCC[cat])
    r = random.random()
    s = s.upper() if r < 0.55 else s.lower() if r < 0.7 else s
    if random.random() < 0.15: s = s[: random.randint(14, 26)]
    return re.sub(r"\s+", " ", s).strip()

def main(out_train="data/train.csv", out_test="data/test.csv"):
    import os; os.makedirs("data", exist_ok=True)
    train, test, test_seen = [], [], []
    for cat, ms in MERCHANTS.items():
        ms = ms[:]; random.shuffle(ms)
        cut = max(3, int(len(ms) * 0.2))            # ~20% of merchants are only ever seen at test time
        for m in ms[cut:]: train += [(line(m, cat), cat) for _ in range(40)]
        for m in ms[:cut]: test += [(line(m, cat), cat) for _ in range(25)]
        for m in ms[cut:]: test_seen += [(line(m, cat), cat) for _ in range(6)]
    random.shuffle(train); random.shuffle(test)
    random.shuffle(test_seen)
    for path, rows in [(out_train, train), (out_test, test), ("data/test_known_merchants.csv", test_seen)]:
        with open(path, "w", newline="") as f:
            w = csv.writer(f); w.writerow(["description", "category"]); w.writerows(rows)
    print(f"train {len(train)} rows, test {len(test)} rows (unseen merchants), {len(test_seen)} new lines from known merchants")

if __name__ == "__main__": main(*sys.argv[1:])
