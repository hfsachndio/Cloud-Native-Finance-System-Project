"""Trains the FinTrack transaction categoriser and exports it for the Node.js API.

Model: character n-gram TF-IDF (2-5 chars within word boundaries, sublinear tf) + multinomial
logistic regression. Character n-grams cope with card prefixes, truncation, typos and merchants
the model has never seen ("PHARMA", "MART", "FUEL" fragments carry over).

Outputs
  ../web/api/_lib/models/categoriser.json   weights used at inference time (same maths in JS)
  reports/categoriser.md / .json            evaluation on held-out merchants + model comparison
  reports/parity.json                       sample predictions the JS test must reproduce
"""
import json, os, re, csv
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.naive_bayes import MultinomialNB
from sklearn.svm import LinearSVC
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.metrics import accuracy_score, f1_score, classification_report, confusion_matrix

DIGITS = re.compile(r"\S*\d\S*")
NON = re.compile(r"[^a-z&' ]+")
def preprocess(s):
    s = s.lower()
    s = DIGITS.sub(" ", s)          # reference numbers, dates, card ids carry no category signal
    s = NON.sub(" ", s)
    return re.sub(r"\s+", " ", s).strip()

# The rules FinTrack used before the model (kept here as the baseline to beat).
RULES = [("Income", ["salary", "payroll", "freelance", "invoice", "refund", "dividend"]), ("Groceries", ["supermarket", "grocery", "mart", "bakery", "fresh"]),
         ("Bills", ["electric", "water bill", "gas bill", "internet", "phone bill", "utility"]), ("Transport", ["uber", "careem", "ride", "fuel", "petrol", "metro", "bus", "taxi"]),
         ("Dining", ["restaurant", "cafe", "coffee", "pizza", "burger", "food delivery"]), ("Health", ["pharmacy", "clinic", "hospital", "doctor", "medicine"]),
         ("Entertainment", ["cinema", "netflix", "spotify", "concert", "game"]), ("Shopping", ["online order", "amazon", "daraz", "store", "mall"])]
def rules(s):
    t = s.lower()
    for c, ks in RULES:
        if any(k in t for k in ks): return c
    return "Uncategorised"

def load(p):
    with open(p) as f: r = list(csv.DictReader(f))
    return [x["description"] for x in r], [x["category"] for x in r]

def main():
    Xtr, ytr = load("data/train.csv"); Xte, yte = load("data/test.csv")
    vec = TfidfVectorizer(preprocessor=preprocess, analyzer="char_wb", ngram_range=(2, 5), sublinear_tf=True, min_df=3, max_features=6000)
    A = vec.fit_transform(Xtr); B = vec.transform(Xte)
    candidates = {
        "logistic_regression": LogisticRegression(C=8, max_iter=3000),
        "linear_svm": LinearSVC(C=1.0),
        "naive_bayes": MultinomialNB(alpha=0.1),
    }
    cv = StratifiedKFold(5, shuffle=True, random_state=0)
    comparison = {}
    for name, m in candidates.items():
        cvs = cross_val_score(m, A, ytr, cv=cv, scoring="f1_macro")
        m.fit(A, ytr); p = m.predict(B)
        comparison[name] = {"cv_macro_f1": round(float(cvs.mean()), 4), "test_accuracy": round(accuracy_score(yte, p), 4), "test_macro_f1": round(f1_score(yte, p, average="macro"), 4)}
    Xk, yk = load("data/test_known_merchants.csv")
    for name, m in candidates.items():
        comparison[name]["known_merchants_accuracy"] = round(accuracy_score(yk, m.predict(vec.transform(Xk))), 4)
    base = [rules(x) for x in Xte]
    comparison["keyword_rules_baseline"] = {"test_accuracy": round(accuracy_score(yte, base), 4), "test_macro_f1": round(f1_score(yte, base, average="macro", labels=sorted(set(yte))), 4), "known_merchants_accuracy": round(accuracy_score(yk, [rules(x) for x in Xk]), 4)}

    model = candidates["logistic_regression"]
    pred = model.predict(B); proba = model.predict_proba(B)
    labels = list(model.classes_)
    report = classification_report(yte, pred, digits=3, output_dict=True)
    cm = confusion_matrix(yte, pred, labels=labels)

    os.makedirs("../web/api/_lib/models", exist_ok=True); os.makedirs("reports", exist_ok=True)
    vocab = sorted(vec.vocabulary_.items(), key=lambda kv: kv[1])
    export = {
        "name": "fintrack-categoriser", "version": 1, "type": "tfidf_char_wb+multinomial_logreg",
        "ngram": [2, 5], "sublinear_tf": True, "labels": labels,
        "vocab": [t for t, _ in vocab], "idf": [round(float(v), 5) for v in vec.idf_],
        "coef": [[round(float(v), 4) for v in row] for row in model.coef_], "intercept": [round(float(v), 4) for v in model.intercept_],
        "metrics": {"known_merchants_accuracy": comparison["logistic_regression"]["known_merchants_accuracy"], "test_accuracy": comparison["logistic_regression"]["test_accuracy"], "test_macro_f1": comparison["logistic_regression"]["test_macro_f1"], "train_rows": len(Xtr), "test_rows": len(Xte)},
    }
    with open("../web/api/_lib/models/categoriser.json", "w") as f: json.dump(export, f, separators=(",", ":"))
    samples = Xte[:40] + ["IMTIAZ SUPER MARKET KHI", "netflix.com", "POS SHELL FUEL STATION", "Dr Khan clinic fee", "salary oct", "raast trf to ali"]
    sp = model.predict_proba(vec.transform(samples))
    with open("reports/parity.json", "w") as f: json.dump([{"text": t, "label": labels[int(np.argmax(p))], "p": round(float(p.max()), 4)} for t, p in zip(samples, sp)], f, indent=1)
    out = {"comparison": comparison, "per_class": {k: {m: round(v[m], 3) for m in ("precision", "recall", "f1-score")} for k, v in report.items() if k in labels},
           "labels": labels, "confusion_matrix": cm.tolist(), "mean_confidence_correct": round(float(proba.max(1)[pred == np.array(yte)].mean()), 3),
           "mean_confidence_wrong": round(float(proba.max(1)[pred != np.array(yte)].mean()), 3), "features": len(vocab)}
    with open("reports/categoriser.json", "w") as f: json.dump(out, f, indent=1)
    md = ["# Transaction categoriser – evaluation", "", f"Train: {len(Xtr)} statement lines · Test: {len(Xte)} lines from **merchants never seen in training** · {len(vocab)} char n-gram features", "",
          "| Model | 5-fold CV macro-F1 | Accuracy, new lines from known merchants | Accuracy, unseen merchants | Macro-F1, unseen merchants |", "|---|---|---|---|---|"]
    for k, v in comparison.items(): md.append(f"| {k} | {v.get('cv_macro_f1', '–')} | {v['known_merchants_accuracy']} | {v['test_accuracy']} | {v['test_macro_f1']} |")
    md += ["", "Shipped: **logistic_regression** (calibrated probabilities let the app show confidence and fall back to *Uncategorised* below 40%).", "",
           "| Category | Precision | Recall | F1 |", "|---|---|---|---|"] + [f"| {k} | {v['precision']} | {v['recall']} | {v['f1-score']} |" for k, v in out["per_class"].items()]
    md += ["", f"Mean confidence when correct: {out['mean_confidence_correct']} · when wrong: {out['mean_confidence_wrong']}", "", "Confusion matrix (rows = true, cols = predicted): " + ", ".join(labels), "", "```"] + [" ".join(f"{v:4d}" for v in r) for r in cm] + ["```"]
    open("reports/categoriser.md", "w").write("\n".join(md) + "\n")
    print(json.dumps(comparison, indent=1)); print("size KB", os.path.getsize("../web/api/_lib/models/categoriser.json") // 1024)

if __name__ == "__main__": main()
